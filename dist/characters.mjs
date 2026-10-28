// The two players, as data. This file is the only place that knows which model and which clips play a part: to swap in
// new characters (e.g. Mixamo rigs), change the source/clip names here, re-run scripts/pack-characters.mjs, and the
// scene code stays as it is. scripts/pack-characters.mjs keeps exactly the clips listed under `clips`.
// Placeholder art: KayKit Character Pack: Adventurers 1.0 by Kay Lousberg, CC0 (see models/KAYKIT-LICENSE.txt).
//
// clips: logical name -> clip name in the source file.
// recolor(h,s,l): run once over the shared colour atlas (h in degrees, s/l 0..1); returns a new [h,s,l] or nothing.
// bones: logical name -> bone name as three.js loads it (GLTFLoader drops '.', so 'hand.l' arrives as 'handl').
const KAYKIT_BONES={hips:'hips',spine:'spine',chest:'chest',head:'head',
  upperArmL:'upperarml',lowerArmL:'lowerarml',wristL:'wristl',handL:'handl',upperArmR:'upperarmr',lowerArmR:'lowerarmr',wristR:'wristr',handR:'handr',
  upperLegL:'upperlegl',lowerLegL:'lowerlegl',footL:'footl',upperLegR:'upperlegr',lowerLegR:'lowerlegr',footR:'footr'};
export const CHARACTERS={
  striker:{
    file:'models/striker.glb',source:'Rogue.glb',height:2.0,number:'01',bones:KAYKIT_BONES,
    glove:{color:'#ff5a1f',cuff:'#fff3e0',size:.19},rim:'#6a9cff',
    // Rogue greens become the club orange; the brown hair goes near-black so the back of the head never reads as bald.
    recolor:(h,s,l)=>h>110&&h<210&&s>.2?[18,.95,Math.min(.62,l*1.05+.08)]:h<40&&s>.25&&l<.5?[228,.35,l*.45]:null,
    clips:{idle:'Unarmed_Idle',strafeLeft:'Running_Strafe_Left',strafeRight:'Running_Strafe_Right',
      punchRight:'Unarmed_Melee_Attack_Punch_A',punchLeft:'Unarmed_Melee_Attack_Punch_B',cheer:'Cheer',hurt:'Hit_A'}
  },
  keeper:{
    // 1.85 m: this placeholder's upper body is long (hips at about a fifth of its height), and a full-length dive must
    // stay within the 1.6 m a beaten keeper may reach, so the fingertips just miss instead of covering the ball's path.
    // Re-measure (keeperReach) when the art changes: a figure with longer legs can be taller.
    file:'models/keeper.glb',source:'Barbarian.glb',height:1.85,number:'1',bones:KAYKIT_BONES,
    glove:{color:'#f4f6ff',cuff:'#1ec8b4',size:.19},rim:'#ffb37a',
    // Barbarian leather browns become the keeper's deep blue kit.
    recolor:(h,s,l)=>h>14&&h<48&&s>.18&&s<.62&&l<.42?[205,.75,l*1.15+.06]:null,
    clips:{idle:'Unarmed_Idle',strafeLeft:'Running_Strafe_Left',strafeRight:'Running_Strafe_Right',
      diveLeft:'Dodge_Left',diveRight:'Dodge_Right',cheer:'Cheer',hurt:'Hit_B'}
  }
};
