-- Drop existing objects
DROP VIEW IF EXISTS user_stats CASCADE;
DROP FUNCTION IF EXISTS get_user_by_id CASCADE;
DROP FUNCTION IF EXISTS calculate_total CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- Create tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert test data
INSERT INTO users (username, email) VALUES
  ('john_doe', 'john@example.com'),
  ('jane_smith', 'jane@example.com');

INSERT INTO orders (user_id, amount, status) VALUES
  (1, 100.50, 'completed'),
  (1, 50.25, 'pending'),
  (2, 200.00, 'completed');

-- Create a view
CREATE VIEW user_stats AS
SELECT 
  u.id,
  u.username,
  u.email,
  COUNT(o.id) as order_count,
  COALESCE(SUM(o.amount), 0) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.username, u.email;

-- Create a simple function with parameters and return value
CREATE FUNCTION get_user_by_id(user_id INTEGER)
RETURNS TABLE(id INTEGER, username VARCHAR, email VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.email
  FROM users u
  WHERE u.id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function that returns a scalar
CREATE FUNCTION calculate_total(p_user_id INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total
  FROM orders
  WHERE user_id = p_user_id;
  
  RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Create a function with multiple OUT parameters
CREATE FUNCTION get_user_summary(
  IN p_user_id INTEGER,
  OUT username VARCHAR,
  OUT email VARCHAR,
  OUT order_count INTEGER,
  OUT total_amount NUMERIC
) AS $$
BEGIN
  SELECT u.username, u.email, COUNT(o.id)::INTEGER, COALESCE(SUM(o.amount), 0)
  INTO username, email, order_count, total_amount
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  WHERE u.id = p_user_id
  GROUP BY u.username, u.email;
END;
$$ LANGUAGE plpgsql;
