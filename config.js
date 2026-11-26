// Datos de conexión a tu proyecto de Supabase.
// Los encuentras en Supabase > Project Settings > API (o "Data API").
// La "anon public key" es pública por diseño: la seguridad la dan las reglas (RLS) de schema.sql.
// NUNCA pegues aquí la "service_role key".
window.TUCITA_CONFIG = {
  SUPABASE_URL: 'https://goeqtafavkibgudfidbw.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_FIqT_UhhjLK18w6x-KD7Sg_ibx2IqEf',
  NOMBRE_CLINICA: 'Vida Sana Veterinaria',
  SCHEMA: 'vet'   // espacio de la base de datos donde viven las tablas de esta app (no cambiar)
};
