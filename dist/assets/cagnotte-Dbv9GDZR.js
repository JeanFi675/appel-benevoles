import{A as d}from"./api-BuJuF9dF.js";import{Q as v}from"./tshirt-DOtM5iXb.js";let o=!1;const x={user:null,container:null,init(t){this.user=t},async getBalance(){if(!this.user)return 0;try{const{data:t,error:e}=await d.rpc("get_user_balance",{target_user_id:this.user.id});if(e)throw e;return t||0}catch(t){return console.error("Error fetching balance:",t),0}},async getStatus(){try{const{data:t,error:e}=await d.fetch("config",{eq:{key:"cagnotte_active"}});if(e)throw e;return t&&t.length>0?t[0].value:!1}catch(t){return console.error("Error fetching status:",t),!1}},async renderWidget(t,e){if(t&&(this.lastParentElement=t,this.lastBenevoleId=e,!o)){o=!0;try{t.querySelector(".cagnotte-widget-content");const[r,i]=await Promise.all([this.getBalance(),this.getStatus()]),l=i?r:0,h="Mon Matériel",g="dégaines";if(!t)return;t.innerHTML="";const s=document.createElement("div");s.className="bg-white rounded-lg shadow-sm p-2 md:p-4 border border-emerald-100 cagnotte-widget-content",s.innerHTML=`
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-xs md:text-sm font-semibold text-emerald-800 uppercase tracking-wide">${h}</h3>
                        <div class="text-sm md:text-xl font-bold text-emerald-600">${parseFloat(l).toFixed(i?2:0)} ${g}</div>
                    </div>
                    ${i?`
                    <button id="show-qr-${e}" class="bg-gray-800 hover:bg-black text-white p-1 md:p-2 rounded-lg transition-colors" title="Afficher mon QR Code">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                        </svg>
                    </button>
                    `:""}
                </div>
                
                <!-- Modal / Expanded Area for QR Code -->
                <div id="qr-container-${e}" class="hidden mt-4 text-center border-t pt-4">
                    <p class="text-sm text-gray-500 mb-2">Présentez ce code pour régler vos consos</p>
                    <div class="flex justify-center bg-white p-2 rounded">
                        <canvas id="qr-canvas-${e}" class="max-w-full h-auto"></canvas>
                    </div>
                </div>
            `,t.appendChild(s);const a=s.querySelector(`#show-qr-${e}`),n=s.querySelector(`#qr-container-${e}`),u=s.querySelector(`#qr-canvas-${e}`);a&&a.addEventListener("click",()=>{if(n.classList.contains("hidden")){n.classList.remove("hidden");const c=window.location.pathname,f=c.substring(0,c.lastIndexOf("/")+1),m=`${window.location.origin}${f}debit.html?id=${e}`;this.generateQR(u,m),a.classList.add("bg-emerald-600"),a.classList.remove("bg-gray-800"),t.classList.add("col-span-2")}else n.classList.add("hidden"),a.classList.remove("bg-emerald-600"),a.classList.add("bg-gray-800"),t.classList.remove("col-span-2")})}finally{o=!1}}},generateQR(t,e){v.toCanvas(t,e,{width:200,margin:2,color:{dark:"#000000",light:"#ffffff"}},function(r){r&&console.error(r)})},lastParentElement:null,lastBenevoleId:null,async refreshWidget(){if(this.lastParentElement&&this.lastBenevoleId){console.log("🔄 Refreshing Cagnotte Widget...");try{await this.renderWidget(this.lastParentElement,this.lastBenevoleId)}catch(t){console.warn("⚠️ Cagnotte refresh skipped (background update):",t.message)}}}};export{x as C};
