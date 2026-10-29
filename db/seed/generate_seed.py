"""
Deterministic seed-data generator for CareFlow HMS.
Usage:  python db/seed/generate_seed.py > db/06_seed.sql

Historical admissions are replayed in chronological order through the real
stored routines (fn_admit_patient / sp_discharge_patient) so that triggers,
exclusion constraints and billing logic are exercised by the seed itself.
"""
import random
from datetime import date, datetime, timedelta

random.seed(42)
TODAY = date.today()
out = []
w = out.append

def q(s):  # SQL string literal
    return "'" + str(s).replace("'", "''") + "'"

# ----------------------------------------------------------------- reference data
DEPTS = {
 "Cardiology": ("Block A, Floor 2", ["Interventional Cardiologist", "Cardiologist"], [
   "Crushing chest pain radiating to the left arm with sweating",
   "Palpitations and dizziness, irregular heartbeat on ECG",
   "Shortness of breath on exertion and swollen ankles, suspected heart failure",
   "Acute myocardial infarction, ST elevation, emergency angioplasty",
   "Uncontrolled hypertension with headache and blurred vision",
   "Chest tightness while climbing stairs, stable angina workup",
   "Fainting episode with very slow pulse, bradycardia evaluation",
   "Post-bypass surgery monitoring after coronary artery grafting"],
  "Heart and blood vessel disorders: chest pain, angina, heart attack, palpitations, arrhythmia, hypertension, heart failure, breathlessness with swollen legs."),
 "Neurology": ("Block A, Floor 3", ["Neurologist", "Neurophysician"], [
   "Sudden weakness of the right side of the body and slurred speech, suspected stroke",
   "Recurrent seizures with loss of consciousness",
   "Severe migraine with aura not responding to medication",
   "Numbness and tingling in both feet, peripheral neuropathy",
   "Tremors in hands and slowness of movement, Parkinsonism evaluation",
   "Head injury after road accident with vomiting and confusion",
   "Facial drooping on one side, Bell's palsy",
   "Memory loss and disorientation in elderly patient"],
  "Brain, spinal cord and nerve disorders: stroke, paralysis, seizures, epilepsy, migraine, numbness, tremor, memory loss, head injury."),
 "Orthopedics": ("Block B, Floor 1", ["Orthopedic Surgeon", "Spine Surgeon"], [
   "Fracture of the right femur after a fall at home",
   "Severe knee pain and stiffness, osteoarthritis, total knee replacement",
   "Lower back pain radiating down the leg, lumbar disc prolapse",
   "Dislocated shoulder during sports",
   "Wrist fracture after slipping on stairs, cast application",
   "Hip fracture in elderly woman, surgical fixation",
   "Torn ligament in the knee, ACL reconstruction",
   "Neck pain with stiffness after whiplash injury"],
  "Bones, joints and muscles: fractures, broken bones, joint pain, arthritis, back pain, disc problems, sports injuries, ligament tears, dislocation."),
 "Pulmonology": ("Block A, Floor 4", ["Pulmonologist", "Chest Physician"], [
   "Persistent cough with fever and chest X-ray showing pneumonia",
   "Acute asthma attack with wheezing and breathlessness",
   "COPD exacerbation in long-term smoker",
   "Coughing up blood with weight loss, tuberculosis suspected",
   "Low oxygen saturation and breathing difficulty",
   "Pleural effusion with chest heaviness",
   "Snoring and daytime sleepiness, obstructive sleep apnea study",
   "Chronic dry cough for three months, interstitial lung disease"],
  "Lung and breathing disorders: cough, pneumonia, asthma, wheezing, COPD, tuberculosis, low oxygen, breathlessness, sleep apnea."),
 "Gastroenterology": ("Block B, Floor 2", ["Gastroenterologist", "Hepatologist"], [
   "Severe abdominal pain with vomiting, acute pancreatitis",
   "Vomiting blood, upper gastrointestinal bleed",
   "Yellowing of eyes and dark urine, jaundice evaluation",
   "Chronic acidity and burning sensation in the stomach",
   "Bloody diarrhoea and cramps, ulcerative colitis flare",
   "Liver cirrhosis with fluid in the abdomen",
   "Difficulty swallowing food, endoscopy required",
   "Gallstones causing pain after fatty meals"],
  "Stomach, intestine and liver disorders: abdominal pain, vomiting, diarrhoea, acidity, jaundice, liver disease, gallstones, GI bleeding."),
 "Nephrology": ("Block C, Floor 2", ["Nephrologist"], [
   "Reduced urine output and rising creatinine, acute kidney injury",
   "Chronic kidney disease requiring haemodialysis",
   "Swelling of face and legs with protein in urine",
   "Severe flank pain from kidney stones",
   "Burning urination with high fever, kidney infection",
   "Electrolyte imbalance with very high potassium"],
  "Kidney disorders: kidney failure, dialysis, creatinine, kidney stones, urinary infection, swelling with protein in urine, electrolyte imbalance."),
 "General Medicine": ("Block C, Floor 1", ["General Physician", "Internal Medicine Specialist"], [
   "High fever with chills and low platelet count, dengue",
   "Typhoid fever with abdominal discomfort",
   "Uncontrolled diabetes with very high blood sugar",
   "Dehydration from food poisoning",
   "Fever with joint pain after mosquito bites, chikungunya",
   "Generalised weakness and fatigue, anaemia workup",
   "Malaria with recurring fever and shivering",
   "Viral fever with body ache not settling for a week"],
  "General internal medicine: fever, infections, dengue, malaria, typhoid, diabetes, dehydration, weakness, fatigue, anaemia."),
 "Pediatrics": ("Block D, Floor 1", ["Pediatrician", "Neonatologist"], [
   "Child with high fever and febrile convulsion",
   "Infant with diarrhoea and dehydration",
   "Newborn jaundice requiring phototherapy",
   "Toddler with wheezing and bronchiolitis",
   "Child with measles rash and cough",
   "Premature baby needing neonatal intensive care"],
  "Children and newborn care: fever in children, infant diarrhoea, newborn jaundice, premature baby, childhood infections, vaccination."),
 "Obstetrics & Gynecology": ("Block D, Floor 2", ["Obstetrician", "Gynecologist"], [
   "Full-term pregnancy in labour for delivery",
   "Planned caesarean section delivery",
   "High blood pressure during pregnancy, pre-eclampsia",
   "Heavy menstrual bleeding with anaemia",
   "Ovarian cyst with lower abdominal pain",
   "Bleeding in early pregnancy, threatened miscarriage"],
  "Pregnancy, childbirth and women's health: labour, delivery, caesarean, pregnancy complications, menstrual problems, ovarian cysts."),
 "Oncology": ("Block E, Floor 3", ["Medical Oncologist", "Surgical Oncologist"], [
   "Breast lump confirmed as carcinoma, chemotherapy cycle",
   "Lung cancer with weight loss, radiotherapy planning",
   "Leukaemia with low blood counts and recurrent infections",
   "Colon cancer surgery, hemicolectomy",
   "Oral cancer in tobacco chewer, biopsy and staging",
   "Febrile neutropenia after chemotherapy"],
  "Cancer care: tumours, malignancy, chemotherapy, radiotherapy, biopsy, leukaemia, breast cancer, lung cancer, oral cancer."),
 "ENT": ("Block B, Floor 3", ["ENT Surgeon"], [
   "Recurrent tonsillitis, tonsillectomy",
   "Chronic sinusitis with nasal blockage, sinus surgery",
   "Sudden hearing loss in one ear",
   "Ear discharge and pain, chronic otitis media",
   "Nosebleed that would not stop"],
  "Ear, nose and throat: tonsils, sore throat, sinusitis, blocked nose, hearing loss, ear infection, nosebleed."),
 "Dermatology": ("Block B, Floor 4", ["Dermatologist"], [
   "Severe skin infection with spreading redness, cellulitis",
   "Extensive psoriasis plaques not responding to creams",
   "Severe allergic rash with blisters after a new medicine",
   "Burns over forearm requiring dressing"],
  "Skin disorders: rashes, skin infection, cellulitis, psoriasis, eczema, allergic reactions, blisters, burns."),
}

FIRST_M = ["Arjun","Rahul","Karthik","Vikram","Suresh","Ramesh","Anil","Pranav","Rohan","Aditya","Siddharth","Manoj",
           "Harish","Naveen","Ganesh","Deepak","Kiran","Varun","Nikhil","Abhishek","Mohan","Sanjay","Ravi","Ashwin"]
FIRST_F = ["Priya","Ananya","Divya","Kavya","Sneha","Lakshmi","Meera","Pooja","Shruti","Nandini","Aishwarya","Revathi",
           "Swathi","Deepa","Anjali","Bhavana","Keerthi","Lavanya","Sowmya","Harini","Isha","Neha","Radha","Gayathri"]
LAST = ["Sharma","Iyer","Reddy","Nair","Rao","Menon","Gupta","Patel","Kumar","Krishnan","Subramanian","Hegde",
        "Shetty","Pillai","Naidu","Verma","Joshi","Bhat","Kulkarni","Desai","Chatterjee","Das","Singh","Murthy"]

def D(d):  # date -> SQL expression relative to CURRENT_DATE (seed stays valid on any day)
    return f"(CURRENT_DATE + {(d - TODAY).days})"

def TS(dt):
    return f"(CURRENT_DATE + {(dt.date() - TODAY).days} + TIME '{dt:%H:%M}')"

def phone():
    return str(random.choice([6,7,8,9])) + "".join(random.choice("0123456789") for _ in range(9))

# ----------------------------------------------------------------- header
w("-- AUTO-GENERATED by db/seed/generate_seed.py  (do not edit by hand)")
w("SET search_path TO hms, public;")
w("SET hms.app_user = 'seed';")
w("BEGIN;")
w("INSERT INTO hospital (hospital_name, location, contact_number) VALUES "
  "('CareFlow Multispeciality Hospital', 'Banashankari, Bengaluru', '08026720000');")

dept_ids = {}
for i, (name, (loc, _, _, _)) in enumerate(DEPTS.items(), start=1):
    dept_ids[name] = i
    w(f"INSERT INTO department (department_name, location, hospital_id) VALUES ({q(name)}, {q(loc)}, 1);")

# ----------------------------------------------------------------- doctors
doctors = []   # (id, name, dept)
used_phones = set()
did = 0
for name, (_, specs, _, _) in DEPTS.items():
    n = 3 if len(DEPTS[name][2]) >= 8 else 2
    for k in range(n):
        did += 1
        g = random.choice([FIRST_M, FIRST_F])
        dname = f"Dr. {random.choice(g)} {random.choice(LAST)}"
        while any(d[1] == dname for d in doctors):
            dname = f"Dr. {random.choice(g)} {random.choice(LAST)}"
        p = phone()
        while p in used_phones: p = phone()
        used_phones.add(p)
        doctors.append((did, dname, name))
        w(f"INSERT INTO doctor (name, specialization, phone_number, department_id) VALUES "
          f"({q(dname)}, {q(specs[k % len(specs)])}, {q(p)}, {dept_ids[name]});")

# ----------------------------------------------------------------- rooms
rooms = []   # (id, type)
rid = 0
for floor, (rtype, count, charge) in enumerate(
        [("General", 14, 1500), ("Semi-Private", 10, 3000), ("Private", 8, 5500), ("ICU", 6, 12000)], start=1):
    for k in range(1, count + 1):
        rid += 1
        rooms.append((rid, rtype))
        w(f"INSERT INTO room (room_number, room_type, charge_per_day) VALUES ('{floor}{k:02d}', {q(rtype)}, {charge});")
w("UPDATE room SET availability = 'Maintenance' WHERE room_number IN ('114', '308');")
maintenance = {14, 14 + 10 + 8}
rooms = [r for r in rooms if r[0] not in maintenance]

# ----------------------------------------------------------------- patients
N_PAT = 220
patients = []
for pid in range(1, N_PAT + 1):
    gender = random.choices(["Male", "Female", "Other"], [48, 50, 2])[0]
    fn = random.choice(FIRST_M if gender == "Male" else FIRST_F if gender == "Female" else FIRST_M + FIRST_F)
    ln = random.choice(LAST)
    dob = TODAY - timedelta(days=random.randint(0 if pid % 15 else 30, 88 * 365))
    if pid % 15 == 0:                      # some children for paediatrics
        dob = TODAY - timedelta(days=random.randint(30, 12 * 365))
    email = f"{fn.lower()}.{ln.lower()}{pid}@example.com" if random.random() < 0.6 else None
    patients.append((pid, dob))
    w(f"INSERT INTO patient (first_name, last_name, gender, date_of_birth, phone_number, hospital_id, email) VALUES "
      f"({q(fn)}, {q(ln)}, {q(gender)}, {D(dob)}, {q(phone())}, 1, {q(email) if email else 'NULL'});")

# ----------------------------------------------------------------- appointments
SYMPTOMS_GENERIC = ["Follow-up review", "Routine check-up", "Review of lab reports", "Medication refill"]
appt_rows = []
for _ in range(420):
    pid = random.randint(1, N_PAT)
    doc = random.choice(doctors)
    days = random.randint(-240, 14)
    hour = random.choice([9, 10, 11, 12, 14, 15, 16, 17])
    minute = random.choice([0, 30])
    dt = datetime.combine(TODAY + timedelta(days=days), datetime.min.time()).replace(hour=hour, minute=minute)
    if days <= 0:
        status = random.choices(["Completed", "Cancelled", "No-Show"], [82, 12, 6])[0]
    else:
        status = random.choices(["Scheduled", "Cancelled"], [92, 8])[0]
    key = (doc[0], dt)
    if status == "Scheduled" and key in {(r[1], r[2]) for r in appt_rows if r[3] == "Scheduled"}:
        continue
    sym = random.choice(DEPTS[doc[2]][2] + SYMPTOMS_GENERIC)
    appt_rows.append((pid, doc[0], dt, status, sym))
appt_rows.sort(key=lambda r: r[2])
for pid, docid, dt, status, sym in appt_rows:
    w(f"INSERT INTO appointment (patient_id, doctor_id, appointment_date, status, symptoms) VALUES "
      f"({pid}, {docid}, {TS(dt)}, {q(status)}, {q(sym)});")

# today's clinic: scheduled appointments in the hours after the seed is loaded
for k in range(1, 9):
    doc = doctors[(k * 7) % len(doctors)]
    w(f"INSERT INTO appointment (patient_id, doctor_id, appointment_date, symptoms) VALUES "
      f"({random.randint(1, N_PAT)}, {doc[0]}, date_trunc('hour', LOCALTIMESTAMP) + INTERVAL '{k // 2 + 1} hours' + INTERVAL '{30 * (k % 2)} minutes', "
      f"{q(random.choice(DEPTS[doc[2]][2]))});")
# the demo doctor (doctor 1) always has patients in the next few hours
for k in range(1, 4):
    w(f"INSERT INTO appointment (patient_id, doctor_id, appointment_date, symptoms) VALUES "
      f"({random.randint(1, N_PAT)}, 1, date_trunc('hour', LOCALTIMESTAMP) + INTERVAL '{k} hours' + INTERVAL '15 minutes', "
      f"{q(random.choice(DEPTS[doctors[0][2]][2]))});")

# ----------------------------------------------------------------- admissions (simulated timeline)
room_free_from = {r[0]: TODAY - timedelta(days=400) for r in rooms}
patient_free_from = {p[0]: TODAY - timedelta(days=400) for p in patients}
events = []
start = TODAY - timedelta(days=270)
adm_no = 0
for day in range(270):
    d = start + timedelta(days=day)
    for _ in range(random.choice([0, 0, 1, 1, 1, 2])):
        dept = random.choices(list(DEPTS), [10, 8, 9, 8, 8, 5, 12, 5, 6, 5, 3, 3])[0]
        doc = random.choice([x for x in doctors if x[2] == dept])
        stay = random.randint(1, 9) if dept != "Oncology" else random.randint(3, 12)
        want = "ICU" if random.random() < 0.12 else random.choice(["General", "General", "Semi-Private", "Private"])
        cands = [r[0] for r in rooms if r[1] == want and room_free_from[r[0]] <= d] or \
                [r[0] for r in rooms if room_free_from[r[0]] <= d]
        if not cands:
            continue
        if dept == "Pediatrics":
            pool = [p[0] for p in patients if (TODAY - p[1]).days < 13 * 365]
        elif dept == "Obstetrics & Gynecology":
            pool = [p[0] for p in patients if 18 * 365 < (TODAY - p[1]).days < 45 * 365]
        else:
            pool = [p[0] for p in patients if (TODAY - p[1]).days > 14 * 365]
        pool = [p for p in pool if patient_free_from[p] <= d]
        if not pool:
            continue
        pid = random.choice(pool)
        room = random.choice(cands)
        discharge = d + timedelta(days=stay)
        open_adm = discharge >= TODAY or ((TODAY - d).days <= 12 and random.random() < 0.7)
        adm_no += 1
        transfer = None
        if not open_adm and stay >= 4 and random.random() < 0.2:
            others = [r[0] for r in rooms if r[0] != room and room_free_from[r[0]] <= d]
            if others:
                transfer = (random.choice(others), d + timedelta(days=stay // 2))
        reason = random.choice(DEPTS[dept][2])
        room_free_from[room] = TODAY + timedelta(days=9999) if open_adm else (transfer[1] if transfer else discharge)
        if transfer:
            room_free_from[transfer[0]] = discharge
        patient_free_from[pid] = TODAY + timedelta(days=9999) if open_adm else discharge + timedelta(days=1)
        events.append((d, "admit", adm_no, pid, doc[0], room, reason))
        if transfer:
            events.append((transfer[1], "transfer", adm_no, transfer[0]))
        if not open_adm:
            events.append((discharge, "discharge", adm_no))

# replay chronologically (discharges before admits on the same day)
order = {"discharge": 0, "transfer": 1, "admit": 2}
events.sort(key=lambda e: (e[0], order[e[1]]))
discharged = []
for e in events:
    if e[1] == "admit":
        _, _, n, pid, docid, room, reason = e
        w(f"SELECT fn_admit_patient({pid}, {docid}, {room}, {q(reason)}, {D(e[0])});  -- admission #{n}")
    elif e[1] == "transfer":
        w(f"SELECT fn_transfer_room({e[2]}, {e[3]}, {D(e[0])});")
    else:
        w(f"CALL sp_discharge_patient({e[2]}, {D(e[0])});")
        discharged.append((e[2], e[0]))

# ----------------------------------------------------------------- payments
for adm, ddate in discharged:
    r = random.random()
    if r < 0.70:   # paid in full, sometimes in two instalments
        if random.random() < 0.3:
            w(f"INSERT INTO payment (bill_id, payment_date, amount, payment_method) "
              f"SELECT bill_id, bill_date, ROUND(total_amount*0.5,2), 'Insurance' FROM bill WHERE admission_id = {adm};")
        w(f"INSERT INTO payment (bill_id, payment_date, amount, payment_method) "
          f"SELECT bill_id, LEAST(bill_date + {random.randint(0,6)}, CURRENT_DATE), fn_bill_outstanding(bill_id), "
          f"{q(random.choice(['UPI','Card','Cash','NetBanking','Insurance']))} FROM bill WHERE admission_id = {adm};")
    elif r < 0.88:  # partial
        w(f"INSERT INTO payment (bill_id, payment_date, amount, payment_method) "
          f"SELECT bill_id, bill_date, ROUND(total_amount*{random.choice([0.3,0.4,0.6])},2), "
          f"{q(random.choice(['UPI','Card','Cash']))} FROM bill WHERE admission_id = {adm};")
    # else: unpaid

# OPD (non-admission) bills for some completed appointments
for i, (pid, docid, dt, status, sym) in enumerate([a for a in appt_rows if a[3] == "Completed"][:60]):
    amt = random.choice([500, 700, 900, 1200])
    w(f"INSERT INTO bill (patient_id, bill_date, total_amount, status) VALUES ({pid}, {D(dt.date())}, {amt}, 'Unpaid');")
    if random.random() < 0.85:
        w(f"INSERT INTO payment (bill_id, payment_date, amount, payment_method) "
          f"VALUES (currval('bill_bill_id_seq'), {D(dt.date())}, {amt}, {q(random.choice(['UPI','Cash','Card']))});")

# ----------------------------------------------------------------- prescriptions & medications
MEDS = {
 "Cardiology": [("Aspirin","75 mg"),("Atorvastatin","20 mg"),("Metoprolol","25 mg"),("Clopidogrel","75 mg"),("Amlodipine","5 mg")],
 "Neurology": [("Levetiracetam","500 mg"),("Sumatriptan","50 mg"),("Pregabalin","75 mg"),("Levodopa-Carbidopa","110 mg")],
 "Orthopedics": [("Diclofenac","50 mg"),("Calcium + Vitamin D3","500 mg"),("Paracetamol","650 mg"),("Thiocolchicoside","4 mg")],
 "Pulmonology": [("Salbutamol Inhaler","100 mcg"),("Budesonide Inhaler","200 mcg"),("Azithromycin","500 mg"),("Montelukast","10 mg")],
 "Gastroenterology": [("Pantoprazole","40 mg"),("Ondansetron","4 mg"),("Ursodeoxycholic Acid","300 mg"),("Mesalamine","800 mg")],
 "Nephrology": [("Furosemide","40 mg"),("Sodium Bicarbonate","500 mg"),("Erythropoietin","4000 IU")],
 "General Medicine": [("Paracetamol","650 mg"),("Metformin","500 mg"),("Doxycycline","100 mg"),("ORS","1 sachet"),("Ferrous Sulphate","200 mg")],
 "Pediatrics": [("Paracetamol Syrup","5 ml"),("Amoxicillin Syrup","5 ml"),("Zinc Syrup","5 ml")],
 "Obstetrics & Gynecology": [("Folic Acid","5 mg"),("Iron + Folic Acid","100 mg"),("Labetalol","100 mg")],
 "Oncology": [("Ondansetron","8 mg"),("Dexamethasone","4 mg"),("Filgrastim","300 mcg")],
 "ENT": [("Amoxicillin-Clavulanate","625 mg"),("Fluticasone Nasal Spray","50 mcg"),("Cetirizine","10 mg")],
 "Dermatology": [("Cetirizine","10 mg"),("Cephalexin","500 mg"),("Clobetasol Cream","0.05%")],
}
FREQ = ["1-0-1", "1-1-1", "0-0-1", "1-0-0", "SOS"]
DUR = ["3 days", "5 days", "7 days", "14 days", "30 days"]
doc_by_id = {d[0]: d for d in doctors}
for pid, docid, dt, status, sym in [a for a in appt_rows if a[3] == "Completed"]:
    if random.random() < 0.65:
        w(f"INSERT INTO prescription (patient_id, doctor_id, prescription_date) VALUES ({pid}, {docid}, {D(dt.date())});")
        for med, dose in random.sample(MEDS[doc_by_id[docid][2]], k=min(3, random.randint(1, 3))):
            w(f"INSERT INTO medication VALUES (currval('prescription_prescription_id_seq'), {q(med)}, {q(dose)}, "
              f"{q(random.choice(FREQ))}, {q(random.choice(DUR))});")

# ----------------------------------------------------------------- tests & results
TESTS = [
 ("Complete Blood Count", [("Haemoglobin","g/dL","12-16",(7,17)),("WBC Count","x10^3/uL","4-11",(3,18)),("Platelets","x10^3/uL","150-450",(40,500))]),
 ("Fasting Blood Sugar", [("Glucose (Fasting)","mg/dL","70-110",(65,260))]),
 ("Lipid Profile", [("Total Cholesterol","mg/dL","125-200",(130,290)),("LDL","mg/dL","50-130",(60,210))]),
 ("Renal Function Test", [("Serum Creatinine","mg/dL","0.6-1.2",(0.5,6.5)),("Blood Urea","mg/dL","15-40",(12,140))]),
 ("Liver Function Test", [("Total Bilirubin","mg/dL","0.2-1.2",(0.3,8)),("SGPT (ALT)","U/L","7-56",(10,320))]),
 ("Troponin I", [("Troponin I","ng/mL","0-0.04",(0.0,2.5))]),
 ("Dengue NS1 Antigen", [("NS1 Antigen","","Negative",None)]),
 ("HbA1c", [("HbA1c","%","4-5.6",(4.8,11.5))]),
]
for _ in range(260):
    pid = random.randint(1, N_PAT)
    doc = random.choice(doctors)
    tdate = TODAY - timedelta(days=random.randint(0, 200))
    tname, params = random.choice(TESTS)
    status = "Completed" if tdate < TODAY - timedelta(days=1) else random.choice(["Ordered", "In Progress"])
    if random.random() < 0.04: status = "Cancelled"
    w(f"INSERT INTO test (patient_id, doctor_id, test_name, test_date, status) VALUES "
      f"({pid}, {doc[0]}, {q(tname)}, {D(tdate)}, {q('Ordered' if status == 'Completed' else status)});")
    if status == "Completed":
        for pname, unit, rng, span in params:
            val = random.choice(["Negative", "Negative", "Positive"]) if span is None else \
                  (round(random.uniform(*span), 2) if span[1] < 20 else int(random.uniform(*span)))
            w(f"INSERT INTO test_result (test_id, result_value, units, reference_range) VALUES "
              f"(currval('test_test_id_seq'), {q(str(val))}, {q(unit) if unit else 'NULL'}, {q(rng)});")

# ----------------------------------------------------------------- application users (demo credentials)
w("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;")
w("INSERT INTO app_user (username, password_hash, full_name, role) VALUES "
  "('admin', public.crypt('Admin@123', public.gen_salt('bf', 10)), 'System Administrator', 'admin'), "
  "('reception', public.crypt('Reception@123', public.gen_salt('bf', 10)), 'Front Desk', 'receptionist');")
for docid, dname, dept in doctors:
    uname = "dr." + dname.split()[1].lower() + str(docid)
    w(f"INSERT INTO app_user (username, password_hash, full_name, role, doctor_id) VALUES "
      f"({q(uname)}, public.crypt('Doctor@123', public.gen_salt('bf', 10)), {q(dname)}, 'doctor', {docid});")

w("COMMIT;")
w("REFRESH MATERIALIZED VIEW hms.mv_monthly_department_revenue;")
w("ANALYZE;")

# department profiles for the vector store are written as JSON for the embedding script
import json, os
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "department_profiles.json"), "w") as f:
    json.dump({name: v[3] for name, v in DEPTS.items()}, f, indent=2)

print("\n".join(out))
