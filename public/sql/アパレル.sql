SELECT
  category,
  brand,
  season,
  product_type,
  size,
  color,
  sku_code,
  unitprice
FROM your_table
WHERE category = 'アパレル'
ORDER BY brand, season, product_type;
