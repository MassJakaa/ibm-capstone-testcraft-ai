"""
E-Commerce Checkout & Discount Calculation Service
Business Logic for calculating total order price, tax, shipping, and promotional discounts.
"""

def calculate_order_total(items, discount_code=None, is_vip=False, country_code="ID"):
    if not isinstance(items, list):
        raise TypeError("Items must be a list of item dictionaries")
    if len(items) == 0:
        raise ValueError("Cart cannot be empty")
        
    subtotal = 0.0
    for idx, item in enumerate(items):
        if "price" not in item or "quantity" not in item:
            raise KeyError(f"Item at index {idx} must contain 'price' and 'quantity'")
        price = float(item["price"])
        qty = int(item["quantity"])
        
        if price < 0 or qty <= 0:
            raise ValueError(f"Invalid price ({price}) or quantity ({qty}) at index {idx}")
        subtotal += price * qty

    # Calculate discount
    discount_amount = 0.0
    if discount_code:
        code = discount_code.strip().upper()
        if code == "SAVE10":
            discount_amount = subtotal * 0.10
        elif code == "FLAT50" and subtotal >= 200:
            discount_amount = 50.0
        elif code == "SUPERVIP" and is_vip:
            discount_amount = subtotal * 0.25
        else:
            # Invalid or non-applicable code
            discount_amount = 0.0

    # Max discount cannot exceed 70% of subtotal
    max_discount = subtotal * 0.70
    discount_amount = min(discount_amount, max_discount)
    discounted_subtotal = subtotal - discount_amount

    # Tax calculation (ID: 11%, SG: 9%, US: 7%)
    tax_rates = {"ID": 0.11, "SG": 0.09, "US": 0.07}
    tax_rate = tax_rates.get(country_code.upper(), 0.10)
    tax_amount = round(discounted_subtotal * tax_rate, 2)

    # Shipping calculation (Free for VIP or orders over 500)
    if is_vip or discounted_subtotal >= 500.0:
        shipping_cost = 0.0
    else:
        shipping_cost = 25.0 if country_code.upper() != "ID" else 15.0

    grand_total = round(discounted_subtotal + tax_amount + shipping_cost, 2)

    return {
        "subtotal": round(subtotal, 2),
        "discount": round(discount_amount, 2),
        "discounted_subtotal": round(discounted_subtotal, 2),
        "tax": tax_amount,
        "shipping": shipping_cost,
        "grand_total": grand_total
    }
