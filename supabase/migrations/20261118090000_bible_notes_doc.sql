-- Bible highlights and saved-verse folders are synced as one more document per person.
alter table public.user_docs drop constraint user_docs_key_shape;
alter table public.user_docs add constraint user_docs_key_shape check (key ~ '^(profile|plans|library|bible|log-[0-9]{4}-[0-9]{2})$');
