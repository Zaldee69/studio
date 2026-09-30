/** URL publik foto di bucket Storage "site". */
export const photoUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site/${path}` : null;
