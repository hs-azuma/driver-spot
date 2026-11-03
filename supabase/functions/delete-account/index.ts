import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.0";
import { createHandler } from './handler.ts';
Deno.serve(createHandler({createClient,env:key=>Deno.env.get(key)}));
