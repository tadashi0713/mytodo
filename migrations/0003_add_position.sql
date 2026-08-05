-- Migration number: 0003 	 add position for manual ordering
ALTER TABLE tasks ADD COLUMN position REAL;
ALTER TABLE projects ADD COLUMN position REAL;
UPDATE tasks SET position = id;
UPDATE projects SET position = id;
