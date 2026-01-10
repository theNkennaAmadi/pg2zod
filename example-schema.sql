-- Example PostgreSQL schema demonstrating all supported features
-- Run this to create a test database for pg-to-zod

-- Drop existing objects if they exist
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS status CASCADE;
DROP TYPE IF EXISTS address CASCADE;
DROP DOMAIN IF EXISTS email CASCADE;
DROP DOMAIN IF EXISTS positive_int CASCADE;

-- ============================================
-- Enums
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest', 'moderator');
CREATE TYPE status AS ENUM ('pending', 'active', 'inactive', 'archived');

-- ============================================
-- Domains
-- ============================================

CREATE DOMAIN email AS VARCHAR(255) 
  CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

CREATE DOMAIN positive_int AS INTEGER 
  CHECK (VALUE > 0);

-- ============================================
-- Composite Types
-- ============================================

CREATE TYPE address AS (
  street TEXT,
  city VARCHAR(100),
  state CHAR(2),
  zip VARCHAR(10),
  country VARCHAR(100)
);

-- ============================================
-- Tables
-- ============================================

-- Users table with various column types
CREATE TABLE users (
  -- Primary key (auto-increment)
  id SERIAL PRIMARY KEY,
  
  -- Basic text types
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  
  -- Custom types
  email email NOT NULL,
  role user_role DEFAULT 'user',
  
  -- Numeric types
  age INTEGER CHECK (age >= 18 AND age <= 120),
  balance NUMERIC(12, 2) DEFAULT 0.00 CHECK (balance >= 0),
  karma BIGINT DEFAULT 0,
  rating REAL,
  
  -- Boolean
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Date/time types
  birth_date DATE,
  last_login TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- JSON
  settings JSONB DEFAULT '{}',
  metadata JSON,
  
  -- Arrays
  tags TEXT[] DEFAULT '{}',
  favorite_numbers INTEGER[],
  
  -- UUID
  external_id UUID DEFAULT gen_random_uuid(),
  
  -- Network types
  ip_address INET,
  last_ip CIDR,
  
  -- Geometric types (for location)
  location POINT,
  
  -- Composite type
  home_address address,
  
  -- Other types
  profile_picture BYTEA,
  search_vector TSVECTOR
);

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Custom domain
  stock positive_int DEFAULT 1,
  
  -- Numeric with constraints
  price NUMERIC(10, 2) CHECK (price > 0),
  discount_percent INTEGER CHECK (discount_percent >= 0 AND discount_percent <= 100),
  
  -- Status enum
  status status DEFAULT 'active',
  
  -- Array types
  categories TEXT[],
  image_urls TEXT[],
  
  -- Range types (if supported by your PostgreSQL version)
  available_dates DATERANGE,
  price_range INT4RANGE,
  
  -- JSON
  specifications JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  quantity positive_int DEFAULT 1,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  
  status status DEFAULT 'pending',
  
  order_date TIMESTAMPTZ DEFAULT NOW(),
  shipped_date TIMESTAMPTZ,
  delivered_date TIMESTAMPTZ,
  
  shipping_address address NOT NULL,
  
  notes TEXT,
  tracking_number VARCHAR(100)
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ============================================
-- Sample Data (Optional)
-- ============================================

INSERT INTO users (username, email, role, age, tags, settings) VALUES
  ('admin', 'admin@example.com', 'admin', 30, ARRAY['tech', 'admin'], '{"theme": "dark"}'),
  ('john_doe', 'john@example.com', 'user', 25, ARRAY['developer', 'nodejs'], '{"notifications": true}'),
  ('jane_smith', 'jane@example.com', 'moderator', 28, ARRAY['moderator', 'community'], '{"theme": "light"}');

INSERT INTO products (name, description, price, stock, status, categories) VALUES
  ('Laptop', 'High-performance laptop', 999.99, 10, 'active', ARRAY['electronics', 'computers']),
  ('Mouse', 'Wireless mouse', 29.99, 50, 'active', ARRAY['electronics', 'accessories']),
  ('Keyboard', 'Mechanical keyboard', 79.99, 25, 'active', ARRAY['electronics', 'accessories']);

-- Verify the schema
\dt
\dT
\dd
