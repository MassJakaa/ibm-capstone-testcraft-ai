"""
Bank Account Transaction & Transfer Module
Handles fund transfer with balance verification, transaction fees, and daily limit enforcement.
"""

class InsufficientFundsError(Exception):
    pass

class DailyLimitExceededError(Exception):
    pass

class BankAccount:
    def __init__(self, account_number: str, initial_balance: float = 0.0, daily_transfer_limit: float = 10000.0):
        if initial_balance < 0:
            raise ValueError("Initial balance cannot be negative")
        self.account_number = account_number
        self.balance = float(initial_balance)
        self.daily_limit = daily_transfer_limit
        self.transferred_today = 0.0
        self.is_frozen = False

    def deposit(self, amount: float) -> float:
        if self.is_frozen:
            raise PermissionError("Account is frozen")
        if amount <= 0:
            raise ValueError("Deposit amount must be strictly positive")
        self.balance += amount
        return self.balance

    def transfer(self, target_account, amount: float, fee: float = 0.0) -> bool:
        if self.is_frozen:
            raise PermissionError("Source account is frozen")
        if target_account.is_frozen:
            raise PermissionError("Target account is frozen")
        if amount <= 0:
            raise ValueError("Transfer amount must be greater than zero")
        if fee < 0:
            raise ValueError("Transfer fee cannot be negative")

        total_deduction = amount + fee
        if self.balance < total_deduction:
            raise InsufficientFundsError(f"Insufficient funds: Balance is {self.balance}, required {total_deduction}")

        if (self.transferred_today + amount) > self.daily_limit:
            raise DailyLimitExceededError(f"Daily limit of {self.daily_limit} exceeded")

        self.balance -= total_deduction
        self.transferred_today += amount
        target_account.deposit(amount)
        return True
