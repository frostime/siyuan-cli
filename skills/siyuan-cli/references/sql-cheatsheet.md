# SiYuan SQL Cheatsheet

```sql
SELECT id, hpath, path FROM blocks WHERE type='d' LIMIT 20;
SELECT id, content, type FROM blocks WHERE content LIKE '%keyword%' LIMIT 20;
SELECT id, box, path, hpath FROM blocks WHERE id = '20260417090223-xxxxxxx';
SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath = '/私人/日记';
```
