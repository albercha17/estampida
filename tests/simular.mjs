import * as M from '../js/motor.js';
const az = M.crearAzar(42);
for (const extra of [0, 4, 10, 20]) {
  const N = 20000; const g=[0,0,0,0]; let cartas=0, pro=0, foto=0; const hist={};
  for (let i=0;i<N;i++){ const {publicas,reserva}=M.prepararMazo(az); const mazo=M.barajar(publicas.concat(reserva.slice(0,extra)),az);
    const r=M.jugarEntera(mazo,az); g[r.ganador]++; cartas+=r.cartas; if(r.prorroga)pro++; if(r.foto)foto++; hist[r.cartas]=(hist[r.cartas]||0)+1;}
  console.log(`extra=${extra} gana%`, g.map(x=>(100*x/N).toFixed(1)).join(' '), 'cartas media', (cartas/N).toFixed(1), 'prorroga%', (100*pro/N).toFixed(1), 'foto%', (100*foto/N).toFixed(1));
}
const {publicas}=M.prepararMazo(az); console.time('cuotas'); console.log(M.calcularCuotas(publicas,3000,az)); console.timeEnd('cuotas');
