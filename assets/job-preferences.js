(function(global){
 const areas=[['preferred_prefecture','preferred_municipality'],['preferred_prefecture_2','preferred_municipality_2'],['preferred_prefecture_3','preferred_municipality_3']];
 function hasAreas(d){return !!d&&areas.some(([p,m])=>!!d[p]&&!!d[m])}
 function matches(d,j){
  if(!d||!j||!areas.some(([p,m])=>!!d[p]&&!!d[m]&&d[p]===j.work_prefecture&&(d[m]===j.work_municipality||d[m]===j.work_prefecture+'全域')))return false;
  const vehicle=({'2tトラック':'2t','4tトラック':'4t'})[String(j.vehicle_type||'')]||j.vehicle_type;
  if((d.preferred_vehicle_types||[]).length&&!d.preferred_vehicle_types.includes(vehicle))return false;
  if((d.preferred_weekdays||[]).length){const date=String(j.work_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const day=new Date(date+'T00:00:00Z').getUTCDay();if(!d.preferred_weekdays.includes(day))return false}
  if((d.preferred_time_slots||[]).length){const time=String(j.start_time||'');if(!/^\d{2}:\d{2}/.test(time))return false;const hour=Number(time.slice(0,2));if(hour<0||hour>=24)return false;const slot=hour<6?'early':hour<12?'morning':hour<18?'afternoon':'evening';if(!d.preferred_time_slots.includes(slot))return false}
  return true;
 }
 global.SpodoraJobPreferences={matches,hasAreas};
})(window);
