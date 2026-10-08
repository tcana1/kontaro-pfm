#!/usr/bin/env python3
"""
Demo seed data generator for PFM showcase screenshots.
Generates 12 months of realistic Brazilian spending data (~R$10k/month average).

Password for demo user: Demo@2025

Usage:
  python3 scripts/seed_demo.py --run          # execute directly against local Supabase
  python3 scripts/seed_demo.py > seed_demo.sql  # dump SQL to file
"""

import hashlib
import random
import sys
import uuid
from datetime import date

def _db_url():
    """Read SUPABASE_DB_URL from env var or .env (selfhost), fall back to defaults."""
    import os
    from pathlib import Path
    url = os.environ.get('SUPABASE_DB_URL')
    if not url:
        for env_file in ['.env', '.env.dev']:
            p = Path(__file__).parent.parent / env_file
            if p.exists():
                for line in p.read_text().splitlines():
                    if line.startswith('SUPABASE_DB_URL='):
                        url = line.split('=', 1)[1].strip()
                        break
            if url:
                break
    return url or 'postgresql://postgres:postgres@localhost:54332/postgres'

DB_URL = _db_url()

RNG = random.Random(42)

USER_ID    = 'de000000-0000-4000-a000-000000000001'
USER_EMAIL = 'demo@pfm.dev'
DEMO_PASS  = 'Demo@2025'

ACC_CHECKING = 'conta-corrente'
ACC_CREDIT   = 'cartao-de-credito'

# 18 months: Apr 2025 → Sep 2026
def month_start(year, month):
    return date(year, month, 1)

MONTHS = []
y, m = 2025, 4
for _ in range(18):
    MONTHS.append(month_start(y, m))
    m += 1
    if m > 12:
        m = 1
        y += 1

# ── Categories ───────────────────────────────────────────────────────────────

GROUPS = [
    # (id, name, emoji, color, is_income)
    (1, 'Moradia',     '🏠', '#E67E22', False),
    (2, 'Alimentação', '🍽️', '#27AE60', False),
    (3, 'Transporte',  '🚗', '#2980B9', False),
    (4, 'Saúde',       '💊', '#8E44AD', False),
    (5, 'Lazer',       '🎮', '#E74C3C', False),
    (6, 'Educação',    '📚', '#F39C12', False),
    (7, 'Vestuário',   '👔', '#1ABC9C', False),
    (8, 'Casa',        '🛋', '#95A5A6', False),
    (9, 'Serviços',    '📱', '#3498DB', False),
]

CATEGORIES = [
    # (id, name, group_id, color)
    # Moradia
    (1,  'Aluguel',          1, '#E67E22'),
    (2,  'Condomínio',       1, '#D35400'),
    (3,  'IPTU',             1, '#CA6F1E'),
    (4,  'Manutenção',       1, '#BA4A00'),
    # Alimentação
    (5,  'Supermercado',     2, '#27AE60'),
    (6,  'Restaurantes',     2, '#1E8449'),
    (7,  'Delivery',         2, '#196F3D'),
    (8,  'Padaria/Café',     2, '#17A589'),
    # Transporte
    (9,  'Combustível',      3, '#2980B9'),
    (10, 'Uber/Apps',        3, '#1A5276'),
    (11, 'Estacionamento',   3, '#1F618D'),
    (12, 'IPVA/Seguro',      3, '#154360'),
    # Saúde
    (13, 'Plano de Saúde',   4, '#8E44AD'),
    (14, 'Farmácia',         4, '#7D3C98'),
    (15, 'Consultas',        4, '#6C3483'),
    # Lazer
    (16, 'Streaming',        5, '#E74C3C'),
    (17, 'Cinema/Shows',     5, '#CB4335'),
    (18, 'Viagens',          5, '#B03A2E'),
    (19, 'Hobbies',          5, '#922B21'),
    # Educação
    (20, 'Cursos',           6, '#F39C12'),
    (21, 'Livros',           6, '#D4AC0D'),
    (22, 'Mensalidade',      6, '#B7950B'),
    # Vestuário
    (23, 'Roupas',           7, '#1ABC9C'),
    (24, 'Calçados',         7, '#17A589'),
    # Casa
    (25, 'Mercado/Casa',     8, '#95A5A6'),
    (26, 'Móveis/Deco',      8, '#7F8C8D'),
    (27, 'Eletrodomésticos', 8, '#626567'),
    # Serviços
    (28, 'Internet',         9, '#3498DB'),
    (29, 'Assinaturas',      9, '#2874A6'),
    (30, 'Celular',          9, '#1F618D'),
    # Income (shared system group -1; the category itself is user-owned)
    (31, 'Salário',         -1, '#27AE60'),
]

# Local ids above are only keys used while generating; real ids come from the DB sequence.
CAT = {name: cid for cid, name, *_ in CATEGORIES}
CAT_SALARY   = CAT['Salário']
CAT_TRANSFER = -4   # system Transfer/Payment

CAT_NAME = {cid: name for cid, name, *_ in CATEGORIES}
GROUP_NAME = {gid: name for gid, name, *_ in GROUPS}

PAYEES = {
    'supermarket': ['Pão de Açúcar', 'Extra Supermercados', 'Carrefour', 'Mercado Municipal', 'Hortifruti'],
    'restaurant':  ['Outback Steakhouse', 'Madero', 'Sushi Leblon', 'Cozinha Mineira', 'Pizza Hut',
                    'Chimarrão Gaúcho', 'Bar do Zé', 'Restaurante Dom João', 'Boi na Brasa'],
    'delivery':    ['iFood', 'Rappi', 'Uber Eats'],
    'cafe':        ['Starbucks', 'Padaria Modelo', 'Café Central', 'Cafeteria Saborosa', 'Bob\'s'],
    'gas':         ['Posto Shell', 'Posto Ipiranga', 'Posto BR Petrobras'],
    'uber':        ['Uber', '99Pop'],
    'parking':     ['Parking Avenida', 'Estacionamento Central', 'Park & Go'],
    'pharmacy':    ['Droga Raia', 'Ultrafarma', 'Farmácia Popular', 'Drogasil'],
    'doctor':      ['Clínica São Lucas', 'Hospital Albert Einstein', 'Dr. Consultas'],
    'health_plan': ['Unimed', 'Bradesco Saúde'],
    'gym':         ['Smart Fit', 'Bodytech', 'Academia Total'],
    'cinema':      ['Cinemark', 'Cinépolis', 'UCI Kinoplex'],
    'travel':      ['LATAM Airlines', 'Azul Linhas Aéreas', 'Booking.com', 'Airbnb'],
    'internet':    ['Vivo Fibra', 'NET/Claro', 'TIM Live'],
    'phone':       ['Vivo', 'TIM', 'Claro'],
    'clothes':     ['Renner', 'Riachuelo', 'C&A', 'Zara', 'Farm Rio'],
    'shoes':       ['Arezzo', 'Centauro', 'Netshoes'],
    'course':      ['Udemy', 'Alura', 'Coursera', 'DIO'],
    'books':       ['Amazon Kindle', 'Livraria Cultura', 'Livraria Saraiva'],
    'gifts':       ['Amazon', 'Magazine Luiza', 'Americanas', 'Shopee', 'Mercado Livre'],
    'hardware':    ['Leroy Merlin', 'Ferragens Central', 'Dicico'],
    'eletro':      ['Magazine Luiza', 'Casas Bahia', 'Fast Shop'],
}

# ── Transaction builder ───────────────────────────────────────────────────────

transactions = []
_txn_id = 0

def txn_hash(account_slug, d, payee, amount, nonce):
    raw = f"{account_slug}|{d}|{payee}|{amount}|{nonce}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]

def link_uuid(label):
    return str(uuid.UUID(bytes=hashlib.md5(label.encode()).digest()))

def acc_subq(slug):
    """SQL subquery returning the account id for a given slug + demo user."""
    return f"(SELECT id FROM public.accounts WHERE user_id = '{USER_ID}' AND slug = '{slug}')"

def cat_sql(cid):
    """SQL expression for a category id: system ids are literal, demo ones are looked up by name."""
    if cid <= 0:
        return str(cid)
    name = CAT_NAME[cid].replace("'", "''")
    return f"(SELECT id FROM public.categories WHERE user_id = '{USER_ID}' AND name = '{name}')"

def add(account_slug, d, payee, amount, txn_type, cat_id,
        to_account_slug=None, transfer_link_id=None,
        purchase_date=None, installment_number=None, installment_total=None):
    global _txn_id
    _txn_id += 1
    h = txn_hash(account_slug, d, payee, amount, _txn_id)
    transactions.append({
        'account_slug':       account_slug,
        'date':               d,
        'purchase_date':      purchase_date or d,
        'payee':              payee,
        'amount':             round(float(amount), 2),
        'type':               txn_type,
        'cat_id':             cat_id,
        'to_account_slug':    to_account_slug,
        'transfer_link_id':   transfer_link_id,
        'hash':               h,
        'installment_number': installment_number,
        'installment_total':  installment_total,
    })

def day(m, d):
    return date(m.year, m.month, min(d, 28))

def jitter(base, pct=0.15):
    return base * (1 + RNG.uniform(-pct, pct))

def pick(key):
    return RNG.choice(PAYEES[key])

# ── Generate transactions ─────────────────────────────────────────────────────

cc_bill = {}   # (year, month) → total CC spend

def expense_cc(m, d, payee, amount, cat_id):
    mk = (m.year, m.month)
    add(ACC_CREDIT, day(m, d), payee, -abs(amount), 'expense', cat_id, to_account_slug=None)
    cc_bill[mk] = cc_bill.get(mk, 0.0) + abs(amount)

def expense_chk(m, d, payee, amount, cat_id):
    add(ACC_CHECKING, day(m, d), payee, -abs(amount), 'expense', cat_id)

def income(m, d, payee, amount, cat_id):
    add(ACC_CHECKING, day(m, d), payee, abs(amount), 'income', cat_id)

health_plan_payee = None  # set once per user for consistency

for m in MONTHS:
    # pick consistent health plan payee per user
    if health_plan_payee is None:
        health_plan_payee = pick('health_plan')

    # ── Income ────────────────────────────────────────────────────────────
    salary = round(jitter(13500, 0.02), 2)
    income(m, 5, 'Empresa ABC Ltda', salary, CAT_SALARY)

    # December: 13th salary
    if m.month == 12:
        income(m, 20, 'Empresa ABC Ltda - 13° Salário', round(salary, 2), CAT_SALARY)

    # ── Fixed — Checking ─────────────────────────────────────────────────
    expense_chk(m, 1,  'Imobiliária Geral',          2500,  CAT['Aluguel'])
    expense_chk(m, 10, 'Condomínio Residencial',      450,   CAT['Condomínio'])

    # IPTU: 10 parcelas (jan–out)
    if m.month <= 10:
        expense_chk(m, 15, 'PMSP - IPTU', 340, CAT['IPTU'])

    # IPVA: January (lump sum)
    if m.month == 1:
        expense_chk(m, 22, 'DETRAN-SP - IPVA', round(jitter(1180, 0.05), 2), CAT['IPVA/Seguro'])

    # ── Fixed — Credit Card ───────────────────────────────────────────────
    expense_cc(m, 1,  'Netflix',                 55.90,  CAT['Streaming'])
    expense_cc(m, 1,  'Spotify',                 21.90,  CAT['Streaming'])
    expense_cc(m, 15, 'Amazon Prime',             14.90,  CAT['Streaming'])
    expense_cc(m, 5,  health_plan_payee,          650.00, CAT['Plano de Saúde'])
    expense_cc(m, 10, pick('gym'),               119.90, CAT['Hobbies'])
    expense_cc(m, 15, pick('internet'),           99.90,  CAT['Internet'])
    expense_cc(m, 20, pick('phone'),              49.90,  CAT['Celular'])

    # ── Variable — Checking ───────────────────────────────────────────────
    for _ in range(RNG.randint(1, 2)):
        expense_chk(m, RNG.randint(1, 28), pick('gas'), round(jitter(260, 0.2), 2), CAT['Combustível'])

    # ── Variable — Credit Card ────────────────────────────────────────────

    # Supermercado
    for _ in range(RNG.randint(2, 3)):
        expense_cc(m, RNG.randint(1, 28), pick('supermarket'), round(jitter(750, 0.25), 2), CAT['Supermercado'])

    # Restaurantes (more in Dec, Feb, Jul)
    n_rest = {12: 8, 2: 8, 7: 7}.get(m.month, 5)
    n_rest = RNG.randint(n_rest - 1, n_rest + 2)
    for _ in range(n_rest):
        expense_cc(m, RNG.randint(1, 28), pick('restaurant'), round(jitter(120, 0.4), 2), CAT['Restaurantes'])

    # Delivery
    for _ in range(RNG.randint(2, 5)):
        expense_cc(m, RNG.randint(1, 28), pick('delivery'), round(jitter(58, 0.25), 2), CAT['Delivery'])

    # Padaria/Café
    for _ in range(RNG.randint(4, 8)):
        expense_cc(m, RNG.randint(1, 28), pick('cafe'), round(jitter(32, 0.3), 2), CAT['Padaria/Café'])

    # Farmácia
    for _ in range(RNG.randint(1, 3)):
        expense_cc(m, RNG.randint(1, 28), pick('pharmacy'), round(jitter(90, 0.4), 2), CAT['Farmácia'])

    # Uber
    for _ in range(RNG.randint(3, 6)):
        expense_cc(m, RNG.randint(1, 28), pick('uber'), round(jitter(38, 0.35), 2), CAT['Uber/Apps'])

    # Estacionamento
    for _ in range(RNG.randint(0, 3)):
        expense_cc(m, RNG.randint(1, 28), pick('parking'), round(jitter(25, 0.3), 2), CAT['Estacionamento'])

    # Roupas/Calçados (more in Oct–Dec spring/end-year)
    n_clothes = RNG.randint(0, 2) if m.month in (10, 11, 12, 3) else RNG.randint(0, 1)
    for _ in range(n_clothes):
        if RNG.random() < 0.65:
            expense_cc(m, RNG.randint(1, 28), pick('clothes'), round(jitter(310, 0.4), 2), CAT['Roupas'])
        else:
            expense_cc(m, RNG.randint(1, 28), pick('shoes'),   round(jitter(370, 0.35), 2), CAT['Calçados'])

    # Cinema/Shows
    for _ in range(RNG.randint(0, 2)):
        expense_cc(m, RNG.randint(1, 28), pick('cinema'), round(jitter(90, 0.3), 2), CAT['Cinema/Shows'])

    # Cursos (Jan, Feb, Jul, Aug — school seasons)
    if m.month in (1, 2, 7, 8):
        for _ in range(RNG.randint(0, 2)):
            expense_cc(m, RNG.randint(1, 28), pick('course'), round(jitter(180, 0.4), 2), CAT['Cursos'])

    # Livros (occasional)
    if RNG.random() < 0.4:
        expense_cc(m, RNG.randint(1, 28), pick('books'), round(jitter(65, 0.4), 2), CAT['Livros'])

    # Consultas médicas (occasional)
    if RNG.random() < 0.35:
        expense_cc(m, RNG.randint(1, 28), pick('doctor'), round(jitter(250, 0.3), 2), CAT['Consultas'])

    # ── Seasonal extras ───────────────────────────────────────────────────

    # December: Christmas gifts + special dinner
    if m.month == 12:
        for _ in range(RNG.randint(2, 4)):
            expense_cc(m, RNG.randint(10, 23), pick('gifts'), round(jitter(350, 0.5), 2), CAT['Hobbies'])
        expense_cc(m, 24, 'Pão de Açúcar - Natal', round(jitter(420, 0.2), 2), CAT['Supermercado'])

    # February: Carnival
    if m.month == 2:
        expense_cc(m, RNG.randint(11, 16), 'Camarote Carnaval', round(jitter(220, 0.3), 2), CAT['Cinema/Shows'])
        expense_cc(m, RNG.randint(11, 16), 'Fantasia/Abadá',    round(jitter(240, 0.3), 2), CAT['Cinema/Shows'])

    # July: vacation travel
    if m.month == 7:
        airline = pick('travel')
        expense_cc(m, 5, airline,   round(jitter(1800, 0.25), 2), CAT['Viagens'])
        expense_cc(m, 6, 'Airbnb',  round(jitter(1100, 0.2),  2), CAT['Viagens'])

    # Manutenção casa (~3x/year)
    if m.month in (3, 6, 10) and RNG.random() < 0.6:
        expense_chk(m, RNG.randint(1, 28), pick('hardware'), round(jitter(280, 0.4), 2), CAT['Manutenção'])

    # Eletrodoméstico eventual (~2x/year)
    if m.month in (5, 11) and RNG.random() < 0.5:
        expense_cc(m, RNG.randint(5, 25), pick('eletro'), round(jitter(890, 0.4), 2), CAT['Eletrodomésticos'])

# ── Installment purchases ─────────────────────────────────────────────────────
# 2-3 new purchases per month, 3-12 installments each → ~10-15 entries/month at steady state.
# All installments of the same purchase share purchase_date + payee + amount + installment_total
# (that's what get_dashboard_installments groups on).

PAYEES['installment'] = [
    'Magazine Luiza', 'Casas Bahia', 'Fast Shop', 'Apple Store',
    'Samsung Store', 'Mercado Livre', 'Shopee', 'Nike Store',
    'Adidas', 'Decathlon', 'Farm Rio', 'Arezzo', 'Zara',
    'Dell Computadores', 'Lenovo Store', 'iPlace',
]

INSTALLMENT_CATS = (
    [CAT['Eletrodomésticos']] * 3 +
    [CAT['Roupas']] * 2 +
    [CAT['Calçados']] * 1 +
    [CAT['Viagens']] * 2 +
    [CAT['Hobbies']] * 3 +
    [CAT['Cursos']] * 1
)

for m_idx, m in enumerate(MONTHS):
    n_new = RNG.randint(2, 3)
    for _ in range(n_new):
        n_inst = RNG.randint(3, 12)
        # Scale base amount to installment count: short = smaller purchases
        base = 350 if n_inst <= 3 else (700 if n_inst <= 6 else 1600)
        per_inst = round(jitter(base, 0.5) / n_inst, 2)
        payee    = pick('installment')
        cat_id   = RNG.choice(INSTALLMENT_CATS)
        purch_d  = day(m, RNG.randint(1, 28))

        for i in range(n_inst):
            inst_idx = m_idx + i
            if inst_idx >= len(MONTHS):
                break
            inst_m    = MONTHS[inst_idx]
            pay_d     = day(inst_m, purch_d.day)
            mk        = (inst_m.year, inst_m.month)
            cc_bill[mk] = cc_bill.get(mk, 0.0) + per_inst
            add(ACC_CREDIT, pay_d, payee, -per_inst, 'expense', cat_id,
                purchase_date=purch_d,
                installment_number=i + 1,
                installment_total=n_inst)

# ── Credit card payments ──────────────────────────────────────────────────────
# Pay each month's CC bill on the 10th of the following month.
# Skip Sep 2026 (due Oct 2026 — not yet due at demo date 2026-09-20).

for m in MONTHS[:-1]:
    mk = (m.year, m.month)
    if mk not in cc_bill:
        continue
    bill = round(cc_bill[mk], 2)

    nm = m.month + 1 if m.month < 12 else 1
    ny = m.year if m.month < 12 else m.year + 1
    pay_date = date(ny, nm, 10)

    link = link_uuid(f"cc_payment_{m.year}_{m.month}")

    add(ACC_CHECKING, pay_date, 'Pagamento Fatura Cartão',
        -bill, 'payment', CAT_TRANSFER,
        to_account_slug=ACC_CREDIT, transfer_link_id=link)
    add(ACC_CREDIT, pay_date, 'Pagamento Recebido',
        +bill, 'payment', CAT_TRANSFER,
        to_account_slug=ACC_CHECKING, transfer_link_id=link)

# ── SQL output ────────────────────────────────────────────────────────────────

def q(v):
    """SQL-quote a Python value."""
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

lines = []
w = lines.append

w("-- ============================================================")
w("-- PFM demo seed  |  python3 scripts/seed_demo.py")
w("-- Password: Demo@2025")
w(f"-- Transactions: {len(transactions)}")
w("-- ============================================================")
w("")

# Cleanup (idempotent — delete existing demo user data before re-inserting)
w("-- Cleanup existing demo user data")
# Neutralize starting-balance splits (category_id=-3) so the protect trigger doesn't fire
w(f"UPDATE public.transaction_splits SET category_id = 0 "
  f"WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = '{USER_ID}') "
  f"AND category_id = -3;")
w(f"DELETE FROM public.transactions    WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM public.accounts        WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM public.categories      WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM public.category_groups WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM public.payees          WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM public.settings        WHERE user_id = '{USER_ID}';")
w(f"DELETE FROM auth.users             WHERE id      = '{USER_ID}';")
w("")

# Auth user
w("-- Auth user")
w(f"""INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, deleted_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current,
    phone_change_token, reauthentication_token,
    email_change, phone_change
) VALUES (
    '{USER_ID}',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    '{USER_EMAIL}',
    crypt('{DEMO_PASS}', gen_salt('bf', 10)),
    now(), now(), now(),
    '{{"provider":"email","providers":["email"]}}', '{{}}',
    FALSE, FALSE, NULL,
    '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET
    encrypted_password = crypt('{DEMO_PASS}', gen_salt('bf', 10)),
    email_confirmed_at = now(),
    confirmation_token = '', recovery_token = '',
    email_change_token_new = '', email_change_token_current = '',
    phone_change_token = '', reauthentication_token = '',
    email_change = '', phone_change = '';""")
w("")

# Settings
w("-- Settings")
w(f"""INSERT INTO public.settings (user_id, currency, locale, theme, date_format, onboarded)
VALUES ('{USER_ID}', 'BRL', 'pt-BR', 'light', 'default', TRUE)
ON CONFLICT (user_id) DO NOTHING;""")
w("")

# Category groups
w("-- Category groups")
for gid, name, emoji, color, is_income in GROUPS:
    w(f"INSERT INTO public.category_groups (name, user_id, emoji, color, is_income) "
      f"VALUES ({q(name)}, '{USER_ID}', {q(emoji)}, {q(color)}, {q(is_income)});")
w("")

# Categories
w("-- Categories")
for cid, name, gid, color in CATEGORIES:
    if gid > 0:
        group_sql = (f"(SELECT id FROM public.category_groups "
                     f"WHERE user_id = '{USER_ID}' AND name = {q(GROUP_NAME[gid])})")
    else:
        group_sql = str(gid)
    w(f"INSERT INTO public.categories (name, group_id, user_id, color) "
      f"VALUES ({q(name)}, {group_sql}, '{USER_ID}', {q(color)});")
w("")

# System payee required by create_starting_balance_transaction trigger
w("-- System payees")
w("INSERT INTO public.payees (id, name) VALUES (-1, 'Starting Balance') ON CONFLICT (id) DO NOTHING;")
w("")

# Accounts (no explicit IDs — let the sequence assign them)
w("-- Accounts")
w(f"INSERT INTO public.accounts (name, user_id, type_id, slug, icon) "
  f"VALUES ('Conta Corrente', '{USER_ID}', 1, 'conta-corrente', 'ri-bank-line');")
w(f"INSERT INTO public.accounts (name, user_id, type_id, slug, icon) "
  f"VALUES ('Cartão de Crédito', '{USER_ID}', 2, 'cartao-de-credito', 'ri-bank-card-line');")
w("")

# Transactions + splits: CTE pattern so we don't need explicit transaction IDs
w("-- Transactions + splits")
for t in transactions:
    acct  = acc_subq(t['account_slug'])
    tl    = f"'{t['transfer_link_id']}'::uuid" if t['transfer_link_id'] else 'NULL'
    to_ac = acc_subq(t['to_account_slug']) if t['to_account_slug'] else 'NULL'
    inst_n = q(t['installment_number'])
    inst_t = q(t['installment_total'])
    w(
        f"WITH _t AS ("
        f"INSERT INTO public.transactions "
        f"(unique_hash, account_id, user_id, payment_date, purchase_date, payee, amount, type, "
        f"status_id, to_account_id, transfer_link_id, installment_number, installment_total) "
        f"VALUES ('{t['hash']}', {acct}, '{USER_ID}', "
        f"'{t['date']}', '{t['purchase_date']}', {q(t['payee'])}, {t['amount']}, "
        f"'{t['type']}', 2, {to_ac}, {tl}, {inst_n}, {inst_t}) RETURNING id) "
        f"INSERT INTO public.transaction_splits (transaction_id, category_id, amount) "
        f"SELECT id, {cat_sql(t['cat_id'])}, {t['amount']} FROM _t;"
    )
w("")

sql = '\n'.join(lines)

if '--run' in sys.argv:
    import psycopg2
    print(f"Connecting to {DB_URL.split('@')[-1]}...", file=sys.stderr)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.close()
    print(f"Done. {len(transactions)} transactions inserted for {USER_EMAIL}.", file=sys.stderr)
else:
    print(sql)
