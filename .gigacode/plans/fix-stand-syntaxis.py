import os
import subprocess

def fix_app_syntax():
    """Fix the syntax error in app.js by replacing malformed JSON object with proper JS code."""
    
    file_path = r"c:\Users\D1O\Desktop\TotemMask\public\app.js"
    backup_path = r"c:\Users\D1O\Desktop\TotemMask\public\app.js.bak"
    
    # Read current content
    print(f"Reading file: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Create backup
    print(f"Creating backup: {backup_path}")
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # The malformed JSON object that needs to be replaced
    broken_code = '''{"text": "navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });"}'''
    
    # The correct JavaScript code
    fixed_code = """navSettings?.addEventListener('click', () => showSection('settings'));
navStand?.addEventListener('click', () => { showSection('stand'); loadStandFeed(true); });"""
    
    # Check if broken code exists
    if broken_code in content:
        print("Found malformed JSON object. Replacing with correct JavaScript code...")
        content = content.replace(broken_code, fixed_code)
        
        # Write fixed content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print("✓ File fixed successfully!")
        
        # Verify syntax
        print("\nVerifying syntax...")
        result = subprocess.run(['node', '-c', file_path], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✓ Syntax is correct!")
            print(f"  Backup saved to: {backup_path}")
            return True
        else:
            print("✗ Syntax error detected:")
            print(result.stdout)
            print(result.stderr)
            print(f"\nRestore from backup: copy {backup_path} {file_path}")
            return False
    else:
        print("✗ Malformed JSON object not found. File may already be fixed or structure changed.")
        return False

if __name__ == "__main__":
    success = fix_app_syntax()
    if success:
        print("\n=== Fix completed successfully! ===")
    else:
        print("\n=== Fix failed! Check errors above. ===")
