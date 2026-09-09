from backend.database import Repository
from backend.auth import hash_password

def seed_if_empty():
    users = Repository.list_users()
    if not users:
        print("Seeding database...")
        admin = Repository.create_user("Abhijit", "abhijeet@zero7.in", hash_password("admin123"), "admin")
        member = Repository.create_user("Shailesh", "shailesh@zero7.in", hash_password("member123"), "member")
        
        l1 = Repository.create_lead({"name": "Rahul Sharma", "business_name": "Sharma Tech", "phone": "9876543210", "email": "rahul@sharmatech.in", "source": "website", "status": "new", "priority": "high", "assigned_to": admin['id']})
        l2 = Repository.create_lead({"name": "Priya Singh", "business_name": "Priya Designs", "phone": "8765432109", "email": "priya@designs.in", "source": "meta_ads", "status": "contacted", "priority": "medium", "assigned_to": member['id']})
        l3 = Repository.create_lead({"name": "Amit Patel", "business_name": "Patel Trading", "phone": "7654321098", "email": "amit@pateltrading.in", "source": "referral", "status": "qualified", "priority": "low", "assigned_to": admin['id']})
        l4 = Repository.create_lead({"name": "Neha Gupta", "business_name": "Gupta Solutions", "phone": "6543210987", "email": "neha@guptasolutions.in", "source": "linkedin", "status": "proposal", "priority": "high", "assigned_to": member['id']})
        l5 = Repository.create_lead({"name": "Vikram Desai", "business_name": "Desai Corp", "phone": "5432109876", "email": "vikram@desaicorp.in", "source": "manual", "status": "won", "priority": "medium", "assigned_to": admin['id']})

        Repository.create_deal({"lead_id": l3['id'], "title": "Software Setup", "value": 50000.0, "stage": "proposal", "assigned_to": admin['id']})
        Repository.create_deal({"lead_id": l4['id'], "title": "Annual Maintenance", "value": 120000.0, "stage": "negotiation", "assigned_to": member['id']})

        Repository.log_call({"lead_id": l2['id'], "user_id": member['id'], "outcome": "connected", "notes": "Discussed initial requirements.", "duration_minutes": 15})
        Repository.add_note({"lead_id": l2['id'], "user_id": member['id'], "content": "Client seems interested, follow up next week."})
    else:
        print("Database already seeded.")
