-- Select users and order by registration date

SELECT
  user_id,
  username,
  email,
  date_of_birth,
  registration_date
FROM
  users
ORDER BY
  registration_date DESC;

-- Empty comment
--
