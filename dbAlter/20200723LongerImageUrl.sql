

ALTER TABLE idLoc_user MODIFY COLUMN image varchar(512) CHARSET utf8 NOT NULL DEFAULT '';
ALTER TABLE idL750_user MODIFY COLUMN image varchar(512) CHARSET utf8 NOT NULL DEFAULT '';
ALTER TABLE id192_user MODIFY COLUMN image varchar(512) CHARSET utf8 NOT NULL DEFAULT '';


-- prod
ALTER TABLE id_user MODIFY COLUMN image varchar(512) CHARSET utf8 NOT NULL DEFAULT '';


-- Set Back


ALTER TABLE idLoc_user MODIFY COLUMN image varchar(256) CHARSET utf8 NOT NULL DEFAULT '';
ALTER TABLE idL750_user MODIFY COLUMN image varchar(256) CHARSET utf8 NOT NULL DEFAULT '';
ALTER TABLE id192_user MODIFY COLUMN image varchar(256) CHARSET utf8 NOT NULL DEFAULT '';


-- prod
ALTER TABLE id_user MODIFY COLUMN image varchar(256) CHARSET utf8 NOT NULL DEFAULT '';