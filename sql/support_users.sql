CREATE TABLE IF NOT EXISTS support_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_users_email ON support_users(lower(email));
INSERT INTO support_users (
    email,
    password_hash,
    name,
    first_name,
    last_name
  )
VALUES (
    'admin@trackit.com',
    '$2a$10$OpQVo14jPx03x4dVD/rpNeJUqJyq1RWC2hXt8vtq2v7r.DUVy0IOG',
    'Admin User',
    'Admin',
    'User'
  ),
  (
    'support@trackit.com',
    '$2a$10$LPLNH.YLRswGCTV7IE5KgePgKPGORt.SSFzK4NkAkTjwqzSrO14s.',
    'Support Agent',
    'Support',
    'Agent'
  ),
  (
    'agent1@trackit.com',
    '$2a$10$ukQ7SV.MI5co/fJgXAQ3IOwbYR55yZt4OU88ctDUJKNFRs6fEPrtu',
    'Agent One',
    'Agent',
    'One'
  ),
  (
    'agent2@trackit.com',
    '$2a$10$1uRJG9I28ppfAeGnnXkejuOAOXXU1jEGaFJEiqiujAPoqbSB8z5mK',
    'Agent Two',
    'Agent',
    'Two'
  ) ON CONFLICT (email) DO NOTHING;