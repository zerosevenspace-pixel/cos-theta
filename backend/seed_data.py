from backend.database import Repository
from backend.auth import hash_password

def seed_if_empty():
    users = Repository.list_users()
    if not users:
        print("Initializing production users...")
        Repository.create_user("Abhijit", "abhijeet@zero7.in", hash_password("admin123"), "admin")
        Repository.create_user("Shailesh", "shailesh@zero7.in", hash_password("member123"), "member")
        print("Production users created successfully.")
    else:
        print("Database already contains users.")

