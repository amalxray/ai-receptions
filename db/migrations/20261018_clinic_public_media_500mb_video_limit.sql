-- Increase the clinic public media bucket limit for direct video uploads.
-- Application validation still caps images at 25 MiB and videos at 500 MiB.
update storage.buckets
set file_size_limit = 524288000
where id = 'clinic-public-media';
