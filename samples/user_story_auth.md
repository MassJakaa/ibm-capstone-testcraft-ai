# User Story: User Registration & Authentication

## Title:
As a new customer, I want to securely register an account with email verification and multi-factor authentication (MFA) so that my account credentials and personal data are protected from unauthorized access.

## Acceptance Criteria:
1. **Scenario: Successful Registration with Strong Password**
   - Given the user is on the registration page
   - When the user enters a valid email and a password containing at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character
   - Then the system creates a pending user record and sends a 6-digit OTP code to the email within 30 seconds.

2. **Scenario: Registration with Already Registered Email**
   - Given an account already exists with email `user@example.com`
   - When a new user tries to register with `user@example.com`
   - Then the system returns an error status `409 Conflict` with message "Email already registered" without exposing internal user IDs.

3. **Scenario: Password Policy Enforcement**
   - Given the user enters a password shorter than 8 characters or missing required symbol sets
   - When the form is submitted
   - Then validation fails with explicit field error messages and password strength meter shows "Weak".

4. **Scenario: Rate Limiting on OTP Requests**
   - Given an IP or email requests OTP more than 3 times within 5 minutes
   - When an additional OTP request is sent
   - Then the system returns `429 Too Many Requests` with a retry-after timer header.
