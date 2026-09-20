import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zvogktuqdcpjsfargewg.supabase.co";
const supabaseKey = "YOUR_SUPABASE_PUBLISHABLE_KEY";

export const supabase = createClient(supabaseUrl, supabaseKey);
