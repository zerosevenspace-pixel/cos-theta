from backend.database import Repository
from backend.auth import hash_password

def seed_if_empty():
    users = Repository.list_users()
    if not users:
        print("Seeding database...")
        admin = Repository.create_user("Abhijit", "abhijeet@zero7.in", hash_password("admin123"), "admin")
        member = Repository.create_user("Shailesh", "shailesh@zero7.in", hash_password("member123"), "member")
        
        l1 = Repository.create_lead({"name": "Rahul Sharma", "business_name": "Sharma Tech", "phone": "+91 98765 43210", "email": "rahul@sharmatech.in", "city": "Bengaluru", "temperature": "hot", "call_stage": "first_call", "source": "website", "status": "new", "priority": "high", "deal_value": 75000.0, "assigned_to": admin['id'], "last_update_notes": "Filled contact form on website for branding overhaul."})
        l2 = Repository.create_lead({"name": "Priya Singh", "business_name": "Priya Designs", "phone": "+91 87654 32109", "email": "priya@designs.in", "city": "Mumbai", "temperature": "warm", "call_stage": "follow_up", "source": "meta_ads", "status": "contacted", "priority": "medium", "deal_value": 45000.0, "assigned_to": member['id'], "last_update_notes": "First discovery call completed. Need custom quote."})
        l3 = Repository.create_lead({"name": "Amit Patel", "business_name": "Patel Trading", "phone": "+91 76543 21098", "email": "amit@pateltrading.in", "city": "Ahmedabad", "temperature": "hot", "call_stage": "interested", "source": "referral", "status": "qualified", "priority": "high", "deal_value": 120000.0, "assigned_to": admin['id'], "last_update_notes": "Referred by Ramesh. Wants proposal for complete ERP rollout."})
        l4 = Repository.create_lead({"name": "Neha Gupta", "business_name": "Gupta Solutions", "phone": "+91 65432 10987", "email": "neha@guptasolutions.in", "city": "Delhi NCR", "temperature": "warm", "call_stage": "follow_up", "source": "linkedin", "status": "proposal", "priority": "high", "deal_value": 90000.0, "assigned_to": member['id'], "last_update_notes": "Sent proposal deck yesterday. Waiting for budget sign-off."})
        l5 = Repository.create_lead({"name": "Vikram Desai", "business_name": "Desai Corp", "phone": "+91 54321 09876", "email": "vikram@desaicorp.in", "city": "Pune", "temperature": "cold", "call_stage": "dnp", "source": "scraping", "status": "new", "priority": "medium", "deal_value": 30000.0, "assigned_to": admin['id'], "last_update_notes": "Did not pick up (DNP) on initial call attempt."})

        Repository.create_deal({"lead_id": l3['id'], "title": "Software Setup", "value": 50000.0, "stage": "proposal", "assigned_to": admin['id']})
        Repository.create_deal({"lead_id": l4['id'], "title": "Annual Maintenance", "value": 120000.0, "stage": "negotiation", "assigned_to": member['id']})

        Repository.log_call({"lead_id": l2['id'], "user_id": member['id'], "outcome": "connected", "notes": "Discussed initial requirements.", "duration_minutes": 15})
        Repository.add_note({"lead_id": l2['id'], "user_id": member['id'], "content": "Client seems interested, follow up next week."})
    else:
        print("Database already seeded.")
