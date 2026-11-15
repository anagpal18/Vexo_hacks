"""Three FAKE doctor's notes for testing extractDocument (no real medical data). python3 make_notes.py"""
import datetime, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def font(size, bold=False):
    for p in (["/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold else []) + ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"]:
        try: return ImageFont.truetype(p, size)
        except OSError: pass
    return ImageFont.load_default()

def note(path, lines, photo=False):
    img = Image.new("RGB", (1240, 1600), "white"); d = ImageDraw.Draw(img); y = 70
    for text, size, bold in lines:
        d.text((80, y), text, fill=(20, 20, 30), font=font(size, bold)); y += int(size * 1.7)
    if photo:   # make it look photographed: tilt, warm paper, blur, noise
        img = img.rotate(2.5, expand=True, fillcolor=(235, 228, 210)).filter(ImageFilter.GaussianBlur(1.1))
        px = img.load(); random.seed(3)
        for _ in range(60000):
            x, y2 = random.randrange(img.width), random.randrange(img.height); r, g, b = px[x, y2]; n = random.randint(-25, 25)
            px[x, y2] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.save(path, quality=88)

today = datetime.date.today().strftime("%B %d, %Y")
H, B, N = 40, 34, 30
note("note1-demo.jpg", [
    ("RIVERSIDE GENERAL HOSPITAL", H, True), ("Discharge instructions  (SAMPLE - NOT A REAL PATIENT)", N, False),
    (f"Patient: Asha Sharma        Date: {today}", B, False), ("Physician: Dr. R. Patel", B, False), ("", B, False),
    ("Medications", B, True),
    ("1. Amlodipine 5 mg - one tablet daily at 4 PM (blood pressure)", B, False),
    ("2. Insulin glargine 10 units - every evening at 7 PM", B, False), ("", B, False),
    ("Instructions", B, True), ("- Low-salt diet. Walk 20 minutes a day.", B, False),
    ("- Call 911 for chest pain, shortness of breath or fainting.", B, False), ("", B, False),
    ("Follow-up", B, True), ("Checkup with Dr. Patel on Thursday at 10:00 AM", B, False),
])
note("note2-no-times.jpg", [
    ("LAKESIDE FAMILY CLINIC", H, True), ("Visit summary  (SAMPLE - NOT A REAL PATIENT)", N, False),
    ("Patient: Asha Sharma", B, False), ("", B, False), ("Plan", B, True),
    ("- Metformin 500 mg twice daily with meals", B, False), ("- Atorvastatin 20 mg at bedtime", B, False),
    ("- Eye clinic appointment: December 3 at 2:30 PM", B, False), ("- Drink plenty of water.", B, False),
])
note("note3-photo.jpg", [
    ("Dr. Patel - quick note  (SAMPLE)", H, True), ("Asha: start Lisinopril, take it in the morning.", B, False),
    ("Stop ibuprofen.", B, False), ("Blood test next Monday at 9:15 AM.", B, False),
], photo=True)
print("wrote note1-demo.jpg note2-no-times.jpg note3-photo.jpg")
