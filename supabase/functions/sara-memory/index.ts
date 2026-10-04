import { createClient } from "@supabase/supabase-js";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const normalize=(v:string)=>v.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[ۀة]/g,"ه").replace(/[\u200c\u200f\u200e]/g,"").replace(/[ًٌٍَُِّْـ]/g,"").replace(/\s+/g," ").toLowerCase();
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:req.headers.get("Authorization")??""}}});
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return json({error:"احراز هویت لازم است."},401);
 try{
  if(req.method==="GET"){
   const q=(new URL(req.url).searchParams.get("q")??"").trim();
   let query=supabase.from("sara_memories").select("id,memory,category,importance,source,created_at,updated_at").eq("user_id",user.id).order("importance",{ascending:false}).order("updated_at",{ascending:false}).limit(50);
   if(q)query=query.ilike("memory",`%${q}%`);
   const {data,error}=await query;if(error)return json({error:error.message},400);return json({memories:data??[]});
  }
  const body=await req.json().catch(()=>({}));
  if(req.method==="POST"){
   const memory=String(body.memory??body.fact??"").trim();if(!memory)return json({error:"متن خاطره خالی است."},400);
   const {data:existing,error:findError}=await supabase.from("sara_memories").select("id,memory,category,importance,source").eq("user_id",user.id).limit(100);
   if(findError)return json({error:findError.message},400);
   const duplicate=(existing??[]).find((m:any)=>normalize(m.memory)===normalize(memory));
   if(duplicate){
    const {data,error}=await supabase.from("sara_memories").update({category:String(body.category??duplicate.category??"general"),importance:Math.min(5,Math.max(1,Number(body.importance??duplicate.importance??3))),source:String(body.source??duplicate.source??"user"),updated_at:new Date().toISOString()}).eq("id",duplicate.id).eq("user_id",user.id).select().single();
    if(error)return json({error:error.message},400);return json({memory:data,status:"updated"});
   }
   const {data,error}=await supabase.from("sara_memories").insert({user_id:user.id,memory,category:String(body.category??"general"),importance:Math.min(5,Math.max(1,Number(body.importance??3))),source:String(body.source??"user")}).select().single();
   if(error)return json({error:error.message},400);return json({memory:data,status:"created"},201);
  }
  if(req.method==="PATCH"){
   const id=String(body.id??"");if(!id)return json({error:"شناسه خاطره لازم است."},400);
   const patch:Record<string,unknown>={};if(body.memory!==undefined)patch.memory=String(body.memory).trim();if(body.category!==undefined)patch.category=String(body.category);if(body.importance!==undefined)patch.importance=Math.min(5,Math.max(1,Number(body.importance)));
   const {data,error}=await supabase.from("sara_memories").update(patch).eq("id",id).eq("user_id",user.id).select().single();if(error)return json({error:error.message},400);return json({memory:data});
  }
  if(req.method==="DELETE"){
   const id=String(body.id??new URL(req.url).searchParams.get("id")??"");if(!id)return json({error:"شناسه خاطره لازم است."},400);
   const {error}=await supabase.from("sara_memories").delete().eq("id",id).eq("user_id",user.id);if(error)return json({error:error.message},400);return json({ok:true});
  }
  return json({error:"Method not allowed"},405);
 }catch(e){return json({error:e instanceof Error?e.message:"خطای ناشناخته"},500);}
});