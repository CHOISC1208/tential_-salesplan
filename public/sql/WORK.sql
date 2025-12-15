SELECT
  category_2                         AS category,
  IFNULL(raw_materials, 'なし')      AS raw_materials,
  IFNULL(launch_year_season, 'なし') AS launch_year,
  IFNULL(item_name, 'なし')          AS item_name,
  IFNULL(size, 'なし')               AS size,
  IFNULL(color, 'なし')              AS color,
  sku_code,
  cost_price AS unitprice
FROM `tential-data-prd.warehouse_analytics_master.warehouse_skus`
WHERE category_2 IN ('WORKその他','WORKアクセサリー','WORKアパレル','WORKインナー')
ORDER BY
  category_2,
  raw_materials,
  launch_year_season,
  item_name,
  size,
  color;