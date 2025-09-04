from flask import Flask, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS, cross_origin
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm.attributes import flag_modified
import jwt, uuid, json, traceback, logging, os
from pdf_generator import QuotationPDFGenerator
import threading
import time
from agent_routes import agent_bp

# **Import from our services_data module**
from services_data import (
    get_actual_subservices,
    is_package_header,
    is_customized_header,
    get_services_for_package,
    process_headers_with_subservices,
    calculate_enhanced_pricing,
    requires_approval_due_to_packages,
    requires_approval_due_to_customized_header
)

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///quotations.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'dev-secret-key'
app.config['DEBUG'] = True
app.config['SQLALCHEMY_ECHO'] = False

logging.basicConfig(level=logging.DEBUG)
app.logger.setLevel(logging.DEBUG)

db = SQLAlchemy(app)

# CORS Configuration - Allow ALL origins
CORS(app,
     origins=['*'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'],
     expose_headers=['Content-Disposition'],
     supports_credentials=True)

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "Content-Type,Authorization")
        response.headers.add('Access-Control-Allow-Methods', "GET,PUT,POST,DELETE,OPTIONS")
        response.headers.add('Access-Control-Allow-Credentials', "true")
        return response

app.register_blueprint(agent_bp)

def load_pricing_data():
    try:
        with open("pricing_data.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

PRICING_DATA = load_pricing_data()

def cleanup_temp_pdf(filepath, delay=300):
    def delete_file():
        time.sleep(delay)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                app.logger.debug(f"Cleaned up temp PDF: {filepath}")
        except Exception as e:
            app.logger.error(f"Failed to cleanup temp PDF {filepath}: {str(e)}")
    
    cleanup_thread = threading.Thread(target=delete_file)
    cleanup_thread.daemon = True
    cleanup_thread.start()

def get_next_quotation_number():
    """Generate next sequential quotation number"""
    try:
        existing_quotations = db.session.query(Quotation.id).filter(
            Quotation.id.like('REQ %')
        ).all()
        
        if not existing_quotations:
            return 1
        
        numbers = []
        for (quote_id,) in existing_quotations:
            try:
                parts = quote_id.split(' ')
                if len(parts) == 2 and parts[1].isdigit():
                    numbers.append(int(parts[1]))
            except:
                continue
        
        return max(numbers) + 1 if numbers else 1
    
    except Exception as e:
        app.logger.error(f"Error getting next quotation number: {str(e)}")
        return 1

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fname = db.Column(db.String(80), nullable=True)
    lname = db.Column(db.String(80), nullable=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default="user")
    threshold = db.Column(db.Float, default=0.0)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Quotation(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    developer_type = db.Column(db.String(20), nullable=False)
    project_region = db.Column(db.String(100), nullable=False)
    plot_area = db.Column(db.Float, nullable=False)
    developer_name = db.Column(db.String(200), nullable=False)
    project_name = db.Column(db.String(200))
    contact_mobile = db.Column(db.String(15))
    contact_email = db.Column(db.String(100))
    validity = db.Column(db.String(20), default='7 days')
    payment_schedule = db.Column(db.String(10), default='50%')
    rera_number = db.Column(db.String(50))
    headers = db.Column(MutableList.as_mutable(db.JSON))
    pricing_breakdown = db.Column(MutableList.as_mutable(db.JSON))
    applicable_terms = db.Column(MutableList.as_mutable(db.JSON))
    custom_terms = db.Column(MutableList.as_mutable(db.JSON))
    total_amount = db.Column(db.Float, default=0.0)
    discount_amount = db.Column(db.Float, default=0.0)
    discount_percent = db.Column(db.Float, default=0.0)
    service_summary = db.Column(db.Text)
    created_by = db.Column(db.String(200))
    status = db.Column(db.String(20), default='draft')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    terms_accepted = db.Column(db.Boolean, default=False, nullable=False)
    requires_approval = db.Column(db.Boolean, default=False)
    approved_by = db.Column(db.String(100))
    approved_at = db.Column(db.DateTime)

    def to_dict(self):
        effective_discount = (
            self.discount_percent if self.discount_percent > 0
            else (self.discount_amount / (self.total_amount + self.discount_amount) * 100
                  if self.total_amount and self.discount_amount else 0)
        )
        
        return {
            'id': self.id,
            'developerType': self.developer_type,
            'projectRegion': self.project_region,
            'plotArea': self.plot_area,
            'developerName': self.developer_name,
            'projectName': self.project_name,
            'contactMobile': self.contact_mobile,
            'contactEmail': self.contact_email,
            'validity': self.validity,
            'paymentSchedule': self.payment_schedule,
            'reraNumber': self.rera_number,
            'headers': self.headers or [],
            'pricingBreakdown': self.pricing_breakdown or [],
            'totalAmount': self.total_amount,
            'discountAmount': self.discount_amount,
            'effectiveDiscountPercent': round(effective_discount, 2),
            'serviceSummary': self.service_summary,
            'createdBy': self.created_by,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'termsAccepted': bool(self.terms_accepted),
            'applicableTerms': self.applicable_terms or [],
            'customTerms': self.custom_terms or [],
            'requiresApproval': self.requires_approval,
            'approvedBy': self.approved_by,
            'approvedAt': self.approved_at.isoformat() if self.approved_at else None
        }

def role_required(*roles):
    from functools import wraps
    def wrapper(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            if "Authorization" in request.headers:
                token = request.headers["Authorization"].split(" ")[1]
            if not token:
                return jsonify({"error": "Token missing"}), 401
            try:
                data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
                current_user = User.query.get(data["user_id"])
                if not current_user or current_user.role not in roles:
                    return jsonify({"error": "Insufficient permissions"}), 403
            except Exception as e:
                return jsonify({"error": "Token invalid"}), 401
            return f(current_user, *args, **kwargs)
        return decorated
    return wrapper

def generate_token(user):
    payload = {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=12)
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm="HS256")

def token_required(f):
    from functools import wraps
    def decorator(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            token = request.headers["Authorization"].split(" ")[1]
        if not token:
            return jsonify({"error": "Token missing"}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.get(data["user_id"])
            if not current_user:
                return jsonify({"error": "User not found"}), 401
        except Exception as e:
            app.logger.error(f"Token validation error: {str(e)}")
            return jsonify({"error": "Token invalid"}), 401
        return f(current_user, *args, **kwargs)
    return wraps(f)(decorator)

@app.errorhandler(500)
def internal_error(error):
    app.logger.error('Server Error: %s', error)
    app.logger.error('Traceback: %s', traceback.format_exc())
    db.session.rollback()
    return jsonify({'error': 'Internal server error', 'message': str(error)}), 500

@app.route("/api/signup", methods=["POST"])
@role_required("admin", "manager")
def signup(current_user):
    try:
        data = request.get_json()
        if not data.get("username") or not data.get("password"):
            return jsonify({"error": "Username and password required"}), 400

        if User.query.filter_by(username=data["username"]).first():
            return jsonify({"error": "Username already exists"}), 400

        new_role = data.get("role", "user")
        new_threshold = float(data.get("threshold", 0))

        if current_user.role == "manager":
            if new_role in ["admin", "manager"]:
                return jsonify({"error": "Managers cannot create admin or manager users"}), 403
            if new_threshold > current_user.threshold:
                return jsonify({"error": f"Threshold cannot exceed your limit of {current_user.threshold}%"}), 403

        user = User(
            fname=data.get("fname"),
            lname=data.get("lname"),
            username=data["username"],
            role=new_role,
            threshold=new_threshold
        )
        user.set_password(data["password"])

        db.session.add(user)
        db.session.commit()

        return jsonify({
            "message": "User created successfully",
            "user": {
                "username": user.username,
                "role": user.role,
                "threshold": user.threshold
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Signup error: {str(e)}")
        return jsonify({"error": "User creation failed"}), 500

@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        user = User.query.filter_by(username=data.get("username")).first()

        if not user or not user.check_password(data.get("password")):
            return jsonify({"error": "Invalid credentials"}), 401

        token = generate_token(user)
        if isinstance(token, bytes):
            token = token.decode("utf-8")

        return jsonify({
            "token": token,
            "role": user.role,
            "fname": user.fname,
            "lname": user.lname,
            "username": user.username,
            "threshold": user.threshold
        })

    except Exception as e:
        app.logger.error(f"Login error: {str(e)}")
        return jsonify({"error": "Login failed"}), 500

@app.route("/api/me", methods=["GET"])
@token_required
def get_profile(current_user):
    return jsonify({
        "id": current_user.id,
        "fname": current_user.fname,
        "lname": current_user.lname,
        "username": current_user.username,
        "role": current_user.role,
        "threshold": current_user.threshold
    })

@app.route('/api/quotations', methods=['GET'])
def get_quotations():
    try:
        query = Quotation.query.order_by(Quotation.created_at.desc())
        return jsonify({
            'success': True,
            'data': [q.to_dict() for q in query.all()]
        })
    except Exception as e:
        app.logger.error(f"Get quotations error: {str(e)}")
        return jsonify({'error': 'Failed to fetch quotations'}), 500

@app.route('/api/quotations', methods=['POST'])
@token_required  # Add this decorator
def create_quotation(current_user):  # Add current_user parameter
    try:
        data = request.get_json()
        
        # Generate sequential ID
        next_number = get_next_quotation_number()
        quotation_id = f"REQ {next_number:04d}"
        
        # Process headers with proper subservice handling for all types
        headers = data.get('headers', [])
        app.logger.debug(f"Original headers: {headers}")
        
        processed_headers = process_headers_with_subservices(headers)
        app.logger.debug(f"Processed headers: {processed_headers}")
        
        quotation = Quotation(
            id=quotation_id,
            developer_type=data['developerType'],
            project_region=data['projectRegion'],
            plot_area=float(data['plotArea']),
            developer_name=data['developerName'],
            project_name=data.get('projectName'),
            contact_mobile=data.get('contactMobile'),
            contact_email=data.get('contactEmail'),
            validity=data.get('validity', '7 days'),
            payment_schedule=data.get('paymentSchedule', '50%'),
            rera_number=data.get('reraNumber'),
            service_summary=data.get('serviceSummary'),
            # FIXED: Use current logged-in user
            created_by=f"{current_user.fname} {current_user.lname}".strip() or current_user.username,
            terms_accepted=bool(data.get('termsAccepted', False)),
            applicable_terms=data.get('applicableTerms', []),
            headers=processed_headers
        )

        db.session.add(quotation)
        db.session.commit()

        return jsonify({'success': True, 'data': quotation.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Create quotation error: {str(e)}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to create quotation'}), 500


@app.route('/api/quotations/calculate-pricing', methods=['POST'])
def calculate_pricing():
    try:
        data = request.get_json()
        category = data['developerType']
        region = data['projectRegion']
        plot_area = float(data['plotArea'])
        headers = data.get('headers', [])

        app.logger.debug(f"Calculate pricing - Headers: {headers}")

        # **Use enhanced pricing calculation from services_data.py**
        result = calculate_enhanced_pricing(category, region, plot_area, headers, PRICING_DATA)
        
        app.logger.debug(f"Calculate pricing - Result: {result}")
        return jsonify(result)

    except Exception as e:
        app.logger.error(f"Error calculating pricing: {str(e)}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/quotations/<quotation_id>/pricing', methods=['PUT'])
@token_required
def update_pricing(current_user, quotation_id):
    try:
        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({'error': 'Not found'}), 404

        data = request.get_json()

        if 'pricingBreakdown' in data:
            q.pricing_breakdown = data['pricingBreakdown'] if isinstance(data['pricingBreakdown'], list) else []
            flag_modified(q, 'pricing_breakdown')

        if 'headers' in data:
            # **Enhanced header processing for all types**
            processed_headers = process_headers_with_subservices(data.get('headers', []))
            q.headers = processed_headers
            flag_modified(q, 'headers')

        if 'totalAmount' in data:
            q.total_amount = float(data['totalAmount'])

        if 'discountAmount' in data:
            q.discount_amount = float(data['discountAmount'])

        if 'discountPercent' in data:
            q.discount_percent = float(data['discountPercent'])

        # Check approval requirements
        if q.discount_percent > 0:
            effective_discount = q.discount_percent
        elif q.total_amount and q.discount_amount:
            effective_discount = (q.discount_amount / (q.total_amount + q.discount_amount)) * 100
        else:
            effective_discount = 0

        has_package_approval = requires_approval_due_to_packages(q.headers or [])
        has_customized_header_approval = requires_approval_due_to_customized_header(q.headers or [])

        needs_approval = (
            has_package_approval or
            has_customized_header_approval or
            (q.custom_terms and len(q.custom_terms) > 0) or
            effective_discount > current_user.threshold
        )

        if needs_approval:
            q.requires_approval = True
            q.status = "pending_approval"
            q.approved_by = None
            q.approved_at = None
        else:
            q.requires_approval = False
            q.status = "completed"
            q.approved_by = current_user.username
            q.approved_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'success': True, 'data': q.to_dict()})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error updating pricing: {str(e)}")
        return jsonify({'error': f'Failed to update pricing: {str(e)}'}), 500

@app.route('/api/quotations/<quotation_id>', methods=['PUT'])
@token_required
def update_quotation(current_user, quotation_id):
    try:
        app.logger.debug(f"Updating quotation {quotation_id}")
        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({'error': 'Not found'}), 404

        data = request.get_json()

        if 'headers' in data:
            headers_data = data['headers']
            if isinstance(headers_data, list):
                # **Use enhanced processing**
                processed_headers = process_headers_with_subservices(headers_data)
                q.headers = processed_headers
                flag_modified(q, 'headers')
            else:
                q.headers = []
                flag_modified(q, 'headers')

        if 'serviceSummary' in data:
            q.service_summary = data['serviceSummary']

        if 'status' in data:
            q.status = data['status']

        if 'termsAccepted' in data:
            q.terms_accepted = data['termsAccepted']

        if 'applicableTerms' in data:
            terms_data = data['applicableTerms']
            if isinstance(terms_data, list):
                q.applicable_terms = terms_data
                flag_modified(q, 'applicable_terms')
            else:
                q.applicable_terms = []
                flag_modified(q, 'applicable_terms')

        has_package_approval = requires_approval_due_to_packages(q.headers or [])
        has_customized_header_approval = requires_approval_due_to_customized_header(q.headers or [])

        effective_discount = (
            q.discount_percent if q.discount_percent > 0
            else (q.discount_amount / (q.total_amount + q.discount_amount) * 100
                  if q.total_amount and q.discount_amount else 0)
        )

        needs_approval = (
            has_package_approval or
            has_customized_header_approval or
            (q.custom_terms and len(q.custom_terms) > 0) or
            effective_discount > current_user.threshold
        )

        if needs_approval:
            q.requires_approval = True
            q.status = 'pending_approval'
            q.approved_by = None
            q.approved_at = None
        else:
            q.requires_approval = False
            q.status = 'draft'

        db.session.commit()
        return jsonify({'success': True, 'data': q.to_dict()})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update quotation: {str(e)}'}), 500

@app.route('/api/quotations/<quotation_id>', methods=['GET'])
def get_quotation(quotation_id):
    try:
        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({'error': 'Not found'}), 404

        return jsonify({'success': True, 'data': q.to_dict()})
    except Exception as e:
        return jsonify({'error': 'Failed to fetch quotation'}), 500

@app.route('/api/quotations/<quotation_id>/download-pdf', methods=['GET'])
@cross_origin(origins='*')
def download_quotation_pdf(quotation_id):
    try:
        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({'error': 'Quotation not found'}), 404

        pdf_generator = QuotationPDFGenerator()
        filename = f"Quotation_{quotation_id}.pdf"
        pdf_dir = 'temp_pdfs'
        filepath = os.path.join(pdf_dir, filename)
        os.makedirs(pdf_dir, exist_ok=True)

        app.logger.debug(f"Generating PDF at: {filepath}")
        pdf_generator.generate_pdf(q.to_dict(), filepath)
        app.logger.debug(f"PDF generated successfully at: {filepath}")

        cleanup_temp_pdf(filepath, delay=300)

        response = send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )

        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'

        app.logger.debug(f"PDF sent successfully: {filename}")
        return response

    except Exception as e:
        app.logger.error(f"PDF generation error: {str(e)}")
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500

@app.route('/api/quotations/<quotation_id>/terms', methods=['PUT'])
@token_required
def update_terms(current_user, quotation_id):
    try:
        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({'error': 'Quotation not found'}), 404

        data = request.get_json()

        terms_accepted = data.get('termsAccepted', False)
        applicable_terms = data.get('applicableTerms', [])
        custom_terms = data.get('customTerms', [])

        valid_custom_terms = [term.strip() for term in custom_terms if term.strip()]

        q.terms_accepted = terms_accepted
        q.applicable_terms = applicable_terms if isinstance(applicable_terms, list) else []
        q.custom_terms = valid_custom_terms

        flag_modified(q, 'applicable_terms')
        flag_modified(q, 'custom_terms')

        effective_discount = (
            q.discount_percent if q.discount_percent > 0
            else (q.discount_amount / (q.total_amount + q.discount_amount) * 100
                  if q.total_amount and q.discount_amount else 0)
        )

        has_package_approval = requires_approval_due_to_packages(q.headers or [])
        has_customized_header_approval = requires_approval_due_to_customized_header(q.headers or [])

        needs_approval = (
            has_package_approval or
            has_customized_header_approval or
            len(valid_custom_terms) > 0 or
            effective_discount > current_user.threshold
        )

        if needs_approval:
            q.requires_approval = True
            q.status = 'pending_approval'
            q.approved_by = None
            q.approved_at = None
        else:
            q.requires_approval = False
            q.status = 'completed'
            q.approved_by = current_user.username
            q.approved_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'success': True, 'data': q.to_dict()})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error updating terms: {str(e)}")
        return jsonify({'error': f'Failed to update terms: {str(e)}'}), 500

@app.route("/api/quotations/<quotation_id>/approve", methods=["PUT"])
@token_required
def approve(current_user, quotation_id):
    try:
        if current_user.role not in ["admin", "manager"]:
            return jsonify({"error": "Only admin/manager can approve"}), 403

        q = Quotation.query.filter_by(id=quotation_id).first()
        if not q:
            return jsonify({"error": "Not found"}), 404

        effective_discount = q.discount_percent if q.discount_percent > 0 else (
            (q.discount_amount / (q.total_amount + q.discount_amount)) * 100
            if q.total_amount and q.discount_amount else 0
        )

        if current_user.role == "manager" and effective_discount > current_user.threshold:
            return jsonify({"error": f"Approval requires admin (limit {current_user.threshold}%)"}), 403

        data = request.get_json() or {}

        if data.get("action", "approve") == "approve":
            q.requires_approval = False
            q.status = "completed"
            q.approved_by = current_user.username
            q.approved_at = datetime.utcnow()
        else:
            q.status = "rejected"
            q.requires_approval = False

        db.session.commit()
        return jsonify({"success": True, "data": q.to_dict()})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error approving quotation: {str(e)}")
        return jsonify({"error": f"Failed to approve quotation: {str(e)}"}), 500

@app.route("/api/quotations/pending", methods=["GET"])
@token_required
def pending(current_user):
    try:
        if current_user.role not in ["admin", "manager"]:
            return jsonify({"error": "Only admin/manager can view pending"}), 403

        items = Quotation.query.filter_by(requires_approval=True).all()
        return jsonify({"success": True, "data": [q.to_dict() for q in items]})

    except Exception as e:
        app.logger.error(f"Error fetching pending quotations: {str(e)}")
        return jsonify({"error": "Failed to fetch pending quotations"}), 500

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=3001)
