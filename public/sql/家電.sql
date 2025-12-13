SELECT
  category,
  manufacturer,
  product_line,
  model_name,
  spec,
  sku_code,
  unitprice
FROM your_table
WHERE category = '家電'
ORDER BY manufacturer, product_line, model_name;
