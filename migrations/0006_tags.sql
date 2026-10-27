CREATE TABLE gallery_work_tags (
  work_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (work_id, tag)
);

CREATE INDEX idx_gallery_work_tags_tag ON gallery_work_tags (tag);

CREATE TABLE user_tags (
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (user_id, tag)
);

CREATE INDEX idx_user_tags_tag ON user_tags (tag);
