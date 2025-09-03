from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import os
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas

class VerticalText(Flowable):
    def __init__(self, text):
        Flowable.__init__(self)
        self.text = text

    def draw(self):
        canvas_obj = self.canv
        canvas_obj.saveState()
        canvas_obj.translate(22, 60)
        canvas_obj.rotate(90)
        canvas_obj.setFont("Helvetica-Bold", 13)
        canvas_obj.setFillColor(colors.black)
        text_width = canvas_obj.stringWidth(self.text, "Helvetica-Bold", 13)
        canvas_obj.drawString(-text_width / 2, -4, self.text)
        canvas_obj.restoreState()

    def wrap(self, availWidth, availHeight):
        return 44, 120

class QuotationPDFGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.setup_custom_styles()

    def setup_custom_styles(self):
        self.title_style = ParagraphStyle(
            "Title",
            parent=self.styles["Normal"],
            fontSize=18,
            fontName="Helvetica-Bold",
            textColor=colors.black,
            spaceAfter=10,
            alignment=0,
        )
        self.logo_style = ParagraphStyle(
            "Logo",
            parent=self.styles["Normal"],
            fontSize=14,
            fontName="Helvetica-Bold",
            alignment=2,
        )
        self.service_style = ParagraphStyle(
            "ServiceContent",
            parent=self.styles["Normal"],
            fontSize=14,
            fontName="Helvetica",
            leading=16.8,
            leftIndent=15,
            spaceAfter=4,
            textColor=colors.black,
        )
        self.terms_header_style = ParagraphStyle(
            "TermsHeader",
            parent=self.styles["Normal"],
            fontSize=12,
            fontName="Helvetica-Bold",
            spaceAfter=6,
            textColor=colors.black,
        )
        self.terms_style = ParagraphStyle(
            "Terms",
            parent=self.styles["Normal"],
            fontSize=12,
            spaceAfter=4,
            leftIndent=20,
            textColor=colors.black,
        )
        self.ref_style = ParagraphStyle(
            "RefNumber",
            parent=self.styles["Normal"],
            fontSize=14,
            fontName="Helvetica",
            textColor=colors.black,
            alignment=0,
        )

    def generate_pdf(self, quotation_data, filename):
        temp_filename = filename.replace(".pdf", "_temp.pdf")
        doc = SimpleDocTemplate(
            temp_filename,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50,
        )
        story = []
        try:
            logo_img = Image("logo.jpg", width=80, height=45)
        except:
            logo_img = Paragraph("RERAEasy", self.logo_style)
        header_table = Table(
            [[Paragraph("PROJECT REGISTRATION", self.title_style), logo_img]],
            colWidths=[5 * inch, 1.5 * inch],
        )
        header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(header_table)
        story.append(Spacer(1, 10))
        self.create_services_table(story, quotation_data)
        story.append(Spacer(1, 25))
        story.append(Paragraph("Terms & Conditions:", self.terms_header_style))
        terms = [
            "The above quotation is subject to this project only.",
            "The prices mentioned above DO NOT include Government Fees.",
            "*18% GST Applicable on above mentioned charges.",
            "The services outlined above are included within the project scope. Any additional services not specified are excluded from this scope.",
        ]
        for term in terms:
            story.append(Paragraph(f"• {term}", self.terms_style))
        story.append(Spacer(1, 30))
        req_number = quotation_data.get("id", "QUO-UNKNOWN").replace("QUO-", "REQ ")
        story.append(Paragraph(req_number, self.ref_style))
        doc.build(story)
        self.combine_with_images(temp_filename, filename)
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return filename

    def create_services_table(self, story, quotation_data):
        service_amounts = {}
        total = 0
        for breakdown in quotation_data.get("pricingBreakdown", []):
            for service in breakdown.get("services", []):
                name = service.get("name", "")
                amount = service.get("totalAmount", 0)
                service_amounts[name] = amount
                total += amount

        table_data = []
        spans = []  # track spans for headers

        for header in quotation_data.get("headers", []):
            header_name = header.get("header", "") or header.get("name", "")
            services = header.get("services", [])

            first_row_index = len(table_data)  # index where this header starts

            for si, service in enumerate(services):
                service_name = service.get("label") or service.get("name", "")
                amount = service_amounts.get(service_name, 0)

                subs = []
                for sub in service.get("subServices", []):
                    if isinstance(sub, dict):
                        sub_name = sub.get("name", "").strip()
                    elif isinstance(sub, str):
                        sub_name = sub.strip()
                    else:
                        sub_name = ""
                    if sub_name:
                        subs.append(f"• {sub_name}")

                service_content = "<br/>".join(subs) if subs else "No sub-services selected"
                service_paragraph = Paragraph(service_content, self.service_style)

                price_text = f"₹ {int(amount):,}*" if amount > 0 else ""

                if si == 0:
                    table_data.append([VerticalText(header_name.upper()), service_paragraph, price_text])
                else:
                    table_data.append(["", service_paragraph, price_text])

            # if header had more than one service, span vertically
            if len(services) > 1:
                spans.append(("SPAN", (0, first_row_index), (0, first_row_index + len(services) - 1)))

        # Add total row
        total_price = f"₹ {int(total):,}*"
        table_data.append([
            "",
            Paragraph("Total Payable Amount", self.service_style),
            total_price,
        ])

        services_table = Table(
            table_data,
            colWidths=[44, 4.2 * inch, 1.2 * inch],
        )

        table_style = [
            ("GRID", (0, 0), (-1, -2), 1.5, colors.black),
            ("LINEABOVE", (0, -1), (-1, -1), 2, colors.black),
            ("GRID", (0, -1), (-1, -1), 1.5, colors.black),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -2), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -2), 8),
            ("TOPPADDING", (0, -1), (-1, -1), 10),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
            ("VALIGN", (0, 0), (0, -2), "MIDDLE"),
            ("VALIGN", (1, 0), (1, -1), "TOP"),
            ("VALIGN", (2, 0), (2, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (0, -2), "CENTER"),
            ("ALIGN", (1, 0), (1, -1), "LEFT"),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (2, 0), (2, -1), 14),
            ("ALIGN", (1, -1), (1, -1), "RIGHT"),
            ("FONTNAME", (1, -1), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (1, -1), (2, -1), 14),
            ("SPAN", (0, -1), (1, -1)),
        ]

        # apply header spans
        table_style.extend(spans)

        services_table.setStyle(TableStyle(table_style))
        story.append(services_table)


    def image_to_pdf(self, image_path, pdf_path):
        c = canvas.Canvas(pdf_path, pagesize=A4)
        width, height = A4
        try:
            c.drawImage(image_path, 0, 0, width, height, preserveAspectRatio=True, anchor="c")
        except Exception as e:
            print(f"Warning: Could not load image {image_path}: {e}")
        c.showPage()
        c.save()

    def combine_with_images(self, generated_pdf, final_pdf):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        images_dir = os.path.join(base_dir, "images")
        writer = PdfWriter()
        first_img = os.path.join(images_dir, "1.jpg")
        if os.path.exists(first_img):
            try:
                first_img_pdf = os.path.join(base_dir, "first_temp.pdf")
                self.image_to_pdf(first_img, first_img_pdf)
                reader = PdfReader(first_img_pdf)
                for page in reader.pages:
                    writer.add_page(page)
                os.remove(first_img_pdf)
            except Exception as e:
                print(f"Warning: Could not process first image: {e}")
        try:
            gen_reader = PdfReader(generated_pdf)
            for page in gen_reader.pages:
                writer.add_page(page)
        except Exception as e:
            print(f"Warning: Could not read generated PDF: {e}")
        for i in range(2, 9):
            img_path = os.path.join(images_dir, f"{i}.jpg")
            if os.path.exists(img_path):
                try:
                    img_pdf = os.path.join(base_dir, f"temp_{i}.pdf")
                    self.image_to_pdf(img_path, img_pdf)
                    reader = PdfReader(img_pdf)
                    for page in reader.pages:
                        writer.add_page(page)
                    os.remove(img_pdf)
                except Exception as e:
                    print(f"Warning: Could not process image {img_path}: {e}")
        with open(final_pdf, "wb") as f:
            writer.write(f)
