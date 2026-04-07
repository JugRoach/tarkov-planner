import { T } from '../../theme.js';

export default ({label,color,small})=><span style={{background:color+"22",color,border:`1px solid ${color}44`,padding:small?`3px 8px`:`${T.sp1}px ${T.sp3}px`,fontSize:small?T.fs1:T.fs2,letterSpacing:0.5,fontFamily:T.sans,whiteSpace:"nowrap",borderRadius:T.r1}}>{label}</span>;
