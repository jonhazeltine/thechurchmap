CREATE OR REPLACE FUNCTION public.fn_churches_in_polygon(polygon_geojson text)
RETURNS SETOF public.churches
LANGUAGE sql
AS $$
  SELECT c.*
  FROM public.churches c
  WHERE c.location IS NOT NULL
    AND ST_Within(
      c.location::geometry,
      ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson), 4326)
    );
$$;
