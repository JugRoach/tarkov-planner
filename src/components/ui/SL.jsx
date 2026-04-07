import { T } from '../../theme.js';

export default ({c,s={}})=><div style={{fontSize:T.fs5,color:T.text,letterSpacing:1.5,marginBottom:T.sp3,fontFamily:T.sans,textTransform:"uppercase",fontWeight:600,...s}}>{c}</div>;
