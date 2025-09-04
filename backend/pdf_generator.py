import os
from jinja2 import Environment, FileSystemLoader
import pdfkit
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4


class QuotationPDFGenerator:
    def __init__(self, template_dir="."):
        # Template setup
        self.template_dir = os.path.abspath(template_dir)
        self.env = Environment(loader=FileSystemLoader(self.template_dir))
        self.template_name = "quotation_template.html"

        # wkhtmltopdf setup (change path if installed elsewhere, or set env WKHTMLTOPDF_PATH)
        default_path = r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"
        self.path_wkhtmltopdf = os.environ.get("WKHTMLTOPDF_PATH", default_path)
        if not os.path.exists(self.path_wkhtmltopdf):
            raise FileNotFoundError(
                f"wkhtmltopdf not found at {self.path_wkhtmltopdf}. "
                "Install from https://wkhtmltopdf.org/downloads.html or set WKHTMLTOPDF_PATH."
            )
        self.config = pdfkit.configuration(wkhtmltopdf=self.path_wkhtmltopdf)

        # wkhtmltopdf options
        self.wk_options = {
            "enable-local-file-access": None,          # allow file:// URIs
            "allow": [self.template_dir],              # whitelist template dir for assets
            "page-size": "A4",
            "margin-top": "10mm",
            "margin-right": "12mm",
            "margin-bottom": "12mm",
            "margin-left": "12mm",
            "quiet": "",
            "load-error-handling": "ignore",
            "load-media-error-handling": "ignore",
        }

    # ---------------- Utility helpers ----------------
    def safe_number(self, v, default=0):
        if v is None:
            return default
        try:
            return float(v) if v != "" else default
        except (ValueError, TypeError):
            return default

    def safe_string(self, v, default=""):
        return default if v is None else str(v).strip()

    # ---------------- Public API ----------------
    def generate_pdf(self, quotation_data, filename):
        """
        Build HTML from quotation_data, convert to PDF with wkhtmltopdf,
        and merge optional images before/after the generated content.
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))

        # ---- Build section rows (header -> lines, subtotal) ----
        service_amounts = {}
        for breakdown in quotation_data.get("pricingBreakdown", []) or []:
            for service in breakdown.get("services", []) or []:
                name = self.safe_string(service.get("name", ""))
                if name:
                    service_amounts[name] = self.safe_number(service.get("totalAmount"), 0)

        sections = []
        for idx, header in enumerate(quotation_data.get("headers", []) or []):
            header_name = self.safe_string(
                header.get("name") or header.get("header") or f"Header {idx + 1}"
            ).upper()

            lines, subtotal = [], 0.0
            for svc in header.get("services", []) or []:
                svc_name = self.safe_string(svc.get("name") or svc.get("label") or "Service")
                subtotal += self.safe_number(service_amounts.get(svc_name, 0), 0)

                subs = svc.get("subServices", []) or []
                if subs:
                    for sub in subs:
                        if isinstance(sub, dict):
                            nm = self.safe_string(sub.get("name") or sub.get("text") or sub.get("label"))
                            if nm and sub.get("included", True):
                                lines.append(nm)
                        else:
                            nm = self.safe_string(sub)
                            if nm:
                                lines.append(nm)
                else:
                    lines.append(svc_name)

            sections.append({"header": header_name, "services": lines, "amount": subtotal})

        total_amount = self.safe_number(quotation_data.get("totalAmount"), 0)
        if total_amount <= 0:
            total_amount = sum(s["amount"] for s in sections)

        # ---- Terms ----
        default_terms = [
            "The above quotation is subject to this project only.",
            "The prices mentioned above DO NOT include Government Fees.",
            "18% GST Applicable on above mentioned charges.",
            "The services outlined above are included within the project scope. Any additional services not specified are excluded from this scope.",
        ]
        applicable_terms = [
            self.safe_string(t) for t in (quotation_data.get("applicableTerms", []) or []) if self.safe_string(t)
        ]
        custom_terms = [
            self.safe_string(t) for t in (quotation_data.get("customTerms", []) or []) if self.safe_string(t)
        ]
        terms = default_terms + applicable_terms + custom_terms

        # ---- Reference number ----
        ref_number = self.safe_string(quotation_data.get("id", "REQ 0000"))
        if not ref_number.upper().startswith("REQ"):
            ref_number = f"REQ {ref_number}"

        # ---- Dynamic top header text (e.g., "PROJECT REGISTRATION") ----
        # Support both 'header' and 'pageTitle' keys to be safe
        top_header = self.safe_string(
            quotation_data.get("header") or quotation_data.get("pageTitle") or "PROJECT REGISTRATION"
        )

        # ---- Resolve logo (prefer logo.png, then logo.jpg) as file:/// URI ----
        logo_src = self._file_uri(os.path.join(base_dir, "logo.png"))
        if logo_src is None:
            logo_src = self._file_uri(os.path.join(base_dir, "logo.jpg"))

        # ---- Render HTML ----
        template = self.env.get_template(self.template_name)
        html_out = template.render(
            header=top_header,           # << dynamic header text at the top-left
            sections=sections,
            total=total_amount,
            terms=terms,
            ref_number=ref_number,
            logo_src=logo_src or "",     # template uses {{ logo_src }} on the top-right
        )

        # ---- HTML -> PDF ----
        temp_pdf = filename.replace(".pdf", "_temp.pdf")
        pdfkit.from_string(html_out, temp_pdf, configuration=self.config, options=self.wk_options)

        # ---- Merge optional images (before/after) ----
        self.combine_with_images(temp_pdf, filename)

        # ---- Cleanup ----
        try:
            if os.path.exists(temp_pdf):
                os.remove(temp_pdf)
        except Exception:
            pass

        return filename

    # -------------- Image merge helpers --------------
    def _image_to_pdf(self, image_path, pdf_path):
        """Convert a single image (JPG/PNG) into a one-page A4 PDF."""
        c = canvas.Canvas(pdf_path, pagesize=A4)
        width, height = A4
        try:
            c.drawImage(image_path, 0, 0, width, height, preserveAspectRatio=True, anchor="c")
        except Exception as e:
            print(f"Warning: Could not draw image {image_path}: {e}")
        c.showPage()
        c.save()
        return pdf_path

    def _find_image(self, images_dir, base):
        for ext in (".jpg", ".png", ".jpeg"):
            p = os.path.join(images_dir, base + ext)
            if os.path.exists(p):
                return p
        return None

    def _add_pdf(self, writer, path):
        try:
            reader = PdfReader(path)
            for p in reader.pages:
                writer.add_page(p)
        except Exception as e:
            print(f"Warning: Could not read PDF {path}: {e}")

    def combine_with_images(self, generated_pdf, final_pdf):
        """
        Merge optional images from ./images with the generated PDF.
        Order:
          - images/1.(jpg|png|jpeg)  -> before main content
          - generated pdf
          - images/2..8.(jpg|png|jpeg) -> after main content
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        images_dir = os.path.join(base_dir, "images")
        writer = PdfWriter()
        temps = []

        try:
            # Prepend page
            if os.path.isdir(images_dir):
                first = self._find_image(images_dir, "1")
                if first:
                    t = os.path.join(base_dir, "temp_first.pdf")
                    self._image_to_pdf(first, t)
                    temps.append(t)
                    self._add_pdf(writer, t)

            # Main content
            self._add_pdf(writer, generated_pdf)

            # Append pages
            if os.path.isdir(images_dir):
                for i in range(2, 9):
                    img = self._find_image(images_dir, str(i))
                    if img:
                        t = os.path.join(base_dir, f"temp_{i}.pdf")
                        self._image_to_pdf(img, t)
                        temps.append(t)
                        self._add_pdf(writer, t)

            with open(final_pdf, "wb") as f:
                writer.write(f)
        finally:
            for t in temps:
                try:
                    if os.path.exists(t):
                        os.remove(t)
                except Exception:
                    pass

    # -------------- Path helper --------------
    def _file_uri(self, path):
        """Return a file:/// URI if the file exists, else None."""
        if os.path.exists(path):
            return "file:///" + os.path.abspath(path).replace("\\", "/")
        return None
