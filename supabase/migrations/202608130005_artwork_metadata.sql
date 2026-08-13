alter table public.artworks
  add column style_id citext,
  add column category text,
  add column source_ordinal integer check (source_ordinal is null or source_ordinal > 0),
  add column alt_text text,
  add column mood_tags text[] not null default '{}',
  add column keywords text[] not null default '{}',
  add column avoids text[] not null default '{}',
  add column palette text[] not null default '{}',
  add column lighting text,
  add column medium_and_texture text,
  add column linework_and_edges text,
  add column composition_and_motion text,
  add column source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  add column source_width integer check (source_width is null or source_width >= 1024),
  add column source_height integer check (source_height is null or source_height >= 1024),
  add column source_bytes bigint check (source_bytes is null or source_bytes > 0),
  add column source_mime_type text check (source_mime_type is null or source_mime_type in ('image/jpeg', 'image/png')),
  add column style_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(style_metadata) = 'object'),
  add column search_document text not null default '',
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(description, '')), 'A')
    || setweight(to_tsvector('english', coalesce(category, '')), 'B')
    || setweight(to_tsvector('english', array_to_string(mood_tags, ' ')), 'B')
    || setweight(to_tsvector('english', array_to_string(keywords, ' ')), 'B')
    || setweight(to_tsvector('english', coalesce(search_document, '')), 'C')
  ) stored,
  add constraint artworks_source_square check (
    source_width is null or source_height is null or source_width = source_height
  );

create index artworks_category_idx on public.artworks (category);
create index artworks_mood_tags_gin_idx on public.artworks using gin (mood_tags);
create index artworks_keywords_gin_idx on public.artworks using gin (keywords);
create index artworks_search_vector_gin_idx on public.artworks using gin (search_vector);
