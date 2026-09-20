SELECT 'CREATE DATABASE keycloak OWNER ovc'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
