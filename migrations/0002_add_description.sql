-- Migration number: 0002 	 add description
ALTER TABLE tasks ADD COLUMN description TEXT;
