import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHandler } from './handler.ts';
Deno.serve(createHandler({createClient,env:key=>Deno.env.get(key)}));
