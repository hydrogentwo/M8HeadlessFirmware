(module
 (type $i32_=>_i32 (func (param i32) (result i32)))
 (type $i32_i32_=>_none (func (param i32 i32)))
 (type $i32_=>_none (func (param i32)))
 (type $f32_=>_none (func (param f32)))
 (type $i32_i32_f32_=>_none (func (param i32 i32 f32)))
 (type $i32_f32_f32_=>_none (func (param i32 f32 f32)))
 (type $i32_f32_=>_none (func (param i32 f32)))
 (type $i32_i32_i32_=>_none (func (param i32 i32 i32)))
 (type $none_=>_none (func))
 (global $dsp/voices/P_CUT i32 (i32.const 0))
 (global $dsp/voices/P_RES i32 (i32.const 1))
 (global $dsp/voices/P_ATT i32 (i32.const 2))
 (global $dsp/voices/P_DEC i32 (i32.const 3))
 (global $dsp/voices/P_SUS i32 (i32.const 4))
 (global $dsp/voices/P_REL i32 (i32.const 5))
 (global $dsp/voices/P_VIBR i32 (i32.const 6))
 (global $dsp/voices/P_VIBD i32 (i32.const 7))
 (global $dsp/voices/P_FMIDX i32 (i32.const 8))
 (global $dsp/voices/P_FMRAT i32 (i32.const 9))
 (global $dsp/voices/P_DET i32 (i32.const 10))
 (global $dsp/voices/P_SUB i32 (i32.const 11))
 (global $dsp/voices/P_SLIDE i32 (i32.const 12))
 (global $dsp/voices/P_PWM i32 (i32.const 13))
 (global $dsp/voices/P_FMFB i32 (i32.const 14))
 (global $dsp/voices/sr (mut f32) (f32.const 44100))
 (global $dsp/voices/isr (mut f32) (f32.const 0))
 (global $dsp/voices/slideArmed (mut f32) (f32.const 0))
 (memory $0 8 8)
 (export "P_CUT" (global $dsp/voices/P_CUT))
 (export "P_RES" (global $dsp/voices/P_RES))
 (export "P_ATT" (global $dsp/voices/P_ATT))
 (export "P_DEC" (global $dsp/voices/P_DEC))
 (export "P_SUS" (global $dsp/voices/P_SUS))
 (export "P_REL" (global $dsp/voices/P_REL))
 (export "P_VIBR" (global $dsp/voices/P_VIBR))
 (export "P_VIBD" (global $dsp/voices/P_VIBD))
 (export "P_FMIDX" (global $dsp/voices/P_FMIDX))
 (export "P_FMRAT" (global $dsp/voices/P_FMRAT))
 (export "P_DET" (global $dsp/voices/P_DET))
 (export "P_SUB" (global $dsp/voices/P_SUB))
 (export "P_SLIDE" (global $dsp/voices/P_SLIDE))
 (export "P_PWM" (global $dsp/voices/P_PWM))
 (export "P_FMFB" (global $dsp/voices/P_FMFB))
 (export "init" (func $dsp/voices/init))
 (export "busPtr" (func $dsp/voices/busPtr))
 (export "clearBus" (func $dsp/voices/clearBus))
 (export "setType" (func $dsp/voices/setType))
 (export "setParam" (func $dsp/voices/setParam))
 (export "noteOn" (func $dsp/voices/noteOn))
 (export "noteOff" (func $dsp/voices/noteOff))
 (export "setFreq" (func $dsp/voices/setFreq))
 (export "choke" (func $dsp/voices/choke))
 (export "isActive" (func $dsp/voices/isActive))
 (export "renderAdd" (func $dsp/voices/renderAdd))
 (export "memory" (memory $0))
 (start $~start)
 (func $dsp/voices/init (param $0 f32)
  (local $1 i32)
  (local $2 i32)
  local.get $0
  global.set $dsp/voices/sr
  f32.const 1
  local.get $0
  f32.div
  global.set $dsp/voices/isr
  i32.const 0
  i32.const 0
  i32.const 4096
  memory.fill $0
  loop $for-loop|0
   local.get $2
   i32.const 16
   i32.lt_s
   if
    local.get $2
    i32.const 7
    i32.shl
    local.tee $1
    local.get $2
    i32.const 7777
    i32.mul
    i32.const 22222
    i32.add
    i32.store $0 offset=100
    local.get $1
    f32.const 18e3
    f32.store $0 offset=20
    local.get $1
    f32.const 1
    f32.store $0 offset=52
    local.get $1
    f32.const 0.004999999888241291
    f32.store $0 offset=44
    local.get $1
    f32.const 0.05000000074505806
    f32.store $0 offset=48
    local.get $1
    f32.const 0.07999999821186066
    f32.store $0 offset=56
    local.get $1
    f32.const 1
    f32.store $0 offset=80
    local.get $1
    f32.const 0.5
    f32.store $0 offset=124
    local.get $1
    f32.const 1
    f32.store $0 offset=60
    local.get $2
    i32.const 1
    i32.add
    local.set $2
    br $for-loop|0
   end
  end
 )
 (func $dsp/voices/busPtr (param $0 i32) (result i32)
  local.get $0
  i32.const 13
  i32.shl
  i32.const 4096
  i32.add
 )
 (func $dsp/voices/clearBus (param $0 i32) (param $1 i32)
  local.get $0
  i32.const 13
  i32.shl
  i32.const 4096
  i32.add
  i32.const 0
  local.get $1
  i32.const 2
  i32.shl
  memory.fill $0
 )
 (func $dsp/voices/setType (param $0 i32) (param $1 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.get $1
  i32.store $0
 )
 (func $dsp/voices/setParam (param $0 i32) (param $1 i32) (param $2 f32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.set $0
  local.get $1
  if
   local.get $1
   i32.const 1
   i32.eq
   if
    local.get $0
    local.get $2
    f32.store $0 offset=24
   else
    local.get $1
    i32.const 2
    i32.eq
    if
     local.get $0
     local.get $2
     f32.store $0 offset=44
    else
     local.get $1
     i32.const 3
     i32.eq
     if
      local.get $0
      local.get $2
      f32.store $0 offset=48
     else
      local.get $1
      i32.const 4
      i32.eq
      if
       local.get $0
       local.get $2
       f32.store $0 offset=52
      else
       local.get $1
       i32.const 5
       i32.eq
       if
        local.get $0
        local.get $2
        f32.store $0 offset=56
       else
        local.get $1
        i32.const 6
        i32.eq
        if
         local.get $0
         i32.const -64
         i32.sub
         local.get $2
         f32.store $0
        else
         local.get $1
         i32.const 7
         i32.eq
         if
          local.get $0
          local.get $2
          f32.store $0 offset=68
         else
          local.get $1
          i32.const 8
          i32.eq
          if
           local.get $0
           local.get $2
           f32.store $0 offset=76
          else
           local.get $1
           i32.const 9
           i32.eq
           if
            local.get $0
            local.get $2
            f32.store $0 offset=80
           else
            local.get $1
            i32.const 10
            i32.eq
            if
             local.get $0
             local.get $2
             f32.store $0 offset=84
            else
             local.get $1
             i32.const 11
             i32.eq
             if
              local.get $0
              local.get $2
              f32.store $0 offset=88
             else
              local.get $1
              i32.const 12
              i32.eq
              if
               local.get $2
               global.set $dsp/voices/slideArmed
              else
               local.get $1
               i32.const 13
               i32.eq
               if
                local.get $0
                f32.const 0.05000000074505806
                f32.const 0.949999988079071
                local.get $2
                local.get $2
                f32.const 0.949999988079071
                f32.gt
                select
                local.get $2
                f32.const 0.05000000074505806
                f32.lt
                select
                f32.store $0 offset=124
               else
                local.get $1
                i32.const 14
                i32.eq
                if
                 local.get $0
                 f32.const 0
                 f32.const 0.949999988079071
                 local.get $2
                 local.get $2
                 f32.const 0.949999988079071
                 f32.gt
                 select
                 local.get $2
                 f32.const 0
                 f32.lt
                 select
                 f32.store $0 offset=108
                end
               end
              end
             end
            end
           end
          end
         end
        end
       end
      end
     end
    end
   end
  else
   local.get $0
   local.get $2
   f32.store $0 offset=20
  end
 )
 (func $dsp/voices/noteOn (param $0 i32) (param $1 f32) (param $2 f32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 f32)
  (local $7 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.tee $4
  f32.load $0 offset=4
  local.tee $6
  f32.const 1
  f32.gt
  global.get $dsp/voices/slideArmed
  f32.const 5.000000237487257e-04
  f32.gt
  i32.and
  if
   global.get $dsp/voices/slideArmed
   global.get $dsp/voices/sr
   f32.mul
   i32.trunc_sat_f32_s
   local.tee $3
   i32.const 0
   i32.gt_s
   local.set $7
   local.get $4
   local.get $3
   i32.const 0
   local.get $7
   select
   i32.store $0 offset=92
   local.get $4
   local.get $1
   local.get $6
   f32.sub
   local.get $3
   f32.convert_i32_s
   f32.div
   f32.const 0
   local.get $7
   select
   f32.store $0 offset=96
  else
   local.get $4
   local.get $1
   f32.store $0 offset=4
   local.get $4
   i32.const 0
   i32.store $0 offset=92
  end
  local.get $4
  local.get $1
  f32.store $0 offset=8
  local.get $4
  f32.const 0
  f32.const 1
  local.get $2
  local.get $2
  f32.const 1
  f32.gt
  select
  local.get $2
  f32.const 0
  f32.lt
  select
  f32.store $0 offset=60
  local.get $4
  i32.const 1
  i32.store $0 offset=36
  local.get $4
  f32.const 0
  f32.store $0 offset=40
  local.get $4
  i32.load $0
  i32.const 8
  i32.eq
  if
   global.get $dsp/voices/sr
   local.get $1
   f32.const 10
   local.get $1
   f32.const 10
   f32.gt
   select
   f32.div
   f32.const 0.5
   f32.add
   i32.trunc_sat_f32_s
   local.tee $3
   i32.const 2
   i32.lt_s
   if
    i32.const 2
    local.set $3
   end
   local.get $3
   i32.const 4096
   i32.gt_s
   if
    i32.const 4096
    local.set $3
   end
   local.get $4
   local.get $3
   i32.store $0 offset=116
   local.get $4
   i32.const 0
   i32.store $0 offset=112
   local.get $0
   i32.const 14
   i32.shl
   i32.const 65536
   i32.add
   local.set $7
   loop $for-loop|0
    local.get $3
    local.get $5
    i32.gt_s
    if
     local.get $4
     i32.load $0 offset=100
     local.tee $0
     local.get $0
     i32.const 13
     i32.shl
     i32.xor
     local.tee $0
     local.get $0
     i32.const 17
     i32.shr_u
     i32.xor
     local.tee $0
     local.get $0
     i32.const 5
     i32.shl
     i32.xor
     local.tee $0
     i32.eqz
     if
      i32.const -1640531527
      local.set $0
     end
     local.get $4
     local.get $0
     i32.store $0 offset=100
     local.get $7
     local.get $5
     i32.const 2
     i32.shl
     i32.add
     local.get $0
     f32.convert_i32_u
     f32.const 2.3283064365386963e-10
     f32.mul
     f32.const 2
     f32.mul
     f32.const -1
     f32.add
     f32.store $0
     local.get $5
     i32.const 1
     i32.add
     local.set $5
     br $for-loop|0
    end
   end
  end
 )
 (func $dsp/voices/noteOff (param $0 i32)
  (local $1 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.tee $0
  i32.load $0 offset=36
  local.tee $1
  i32.const 2
  i32.eq
  local.get $1
  i32.const 1
  i32.eq
  i32.or
  local.get $1
  i32.const 3
  i32.eq
  i32.or
  if
   local.get $0
   local.get $0
   f32.load $0 offset=40
   f32.store $0 offset=120
   local.get $0
   i32.const 4
   i32.store $0 offset=36
  end
 )
 (func $dsp/voices/setFreq (param $0 i32) (param $1 f32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.tee $0
  local.get $1
  f32.store $0 offset=4
  local.get $0
  local.get $1
  f32.store $0 offset=8
  local.get $0
  i32.const 0
  i32.store $0 offset=92
 )
 (func $dsp/voices/choke (param $0 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.tee $0
  i32.const 0
  i32.store $0 offset=36
  local.get $0
  f32.const 0
  f32.store $0 offset=40
  local.get $0
  f32.const 0
  f32.store $0 offset=28
  local.get $0
  f32.const 0
  f32.store $0 offset=32
 )
 (func $dsp/voices/isActive (param $0 i32) (result i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  i32.load $0 offset=36
  i32.const 0
  i32.ne
 )
 (func $dsp/voices/renderAdd (param $0 i32) (param $1 i32) (param $2 i32)
  (local $3 f32)
  (local $4 f32)
  (local $5 i32)
  (local $6 f32)
  (local $7 i32)
  (local $8 f32)
  (local $9 f32)
  (local $10 f32)
  (local $11 f32)
  (local $12 i32)
  (local $13 f32)
  (local $14 i32)
  (local $15 i32)
  (local $16 f32)
  (local $17 f32)
  (local $18 f32)
  (local $19 i32)
  (local $20 f32)
  (local $21 f32)
  (local $22 f32)
  (local $23 f32)
  (local $24 f32)
  (local $25 i32)
  (local $26 f32)
  (local $27 f32)
  (local $28 f32)
  (local $29 f32)
  (local $30 f32)
  (local $31 f32)
  (local $32 f32)
  (local $33 f32)
  (local $34 f32)
  (local $35 f32)
  (local $36 f32)
  (local $37 f32)
  (local $38 f32)
  (local $39 f32)
  (local $40 i32)
  (local $41 f32)
  (local $42 f32)
  (local $43 f32)
  (local $44 f32)
  (local $45 f32)
  (local $46 f32)
  (local $47 f32)
  (local $48 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $2
  i32.const 0
  i32.le_s
  local.get $2
  i32.const 2048
  i32.gt_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 7
  i32.shl
  local.tee $12
  i32.load $0 offset=36
  local.tee $15
  i32.eqz
  if
   return
  end
  local.get $12
  i32.load $0
  local.tee $14
  i32.const 0
  i32.le_s
  if
   local.get $12
   i32.const 0
   i32.store $0 offset=36
   return
  end
  local.get $12
  f32.load $0 offset=4
  local.set $4
  local.get $12
  f32.load $0 offset=8
  local.set $26
  local.get $12
  f32.load $0 offset=12
  local.set $3
  local.get $12
  f32.load $0 offset=16
  local.set $9
  local.get $12
  f32.load $0 offset=104
  local.set $16
  local.get $12
  f32.load $0 offset=28
  local.set $17
  local.get $12
  f32.load $0 offset=32
  local.set $18
  local.get $12
  f32.load $0 offset=40
  local.set $10
  local.get $12
  f32.load $0 offset=52
  local.set $11
  local.get $12
  f32.load $0 offset=56
  local.set $6
  local.get $12
  f32.load $0 offset=120
  local.set $27
  local.get $12
  f32.load $0 offset=60
  local.set $28
  local.get $12
  i32.const -64
  i32.sub
  f32.load $0
  local.set $20
  local.get $12
  f32.load $0 offset=68
  local.set $21
  local.get $12
  f32.load $0 offset=72
  local.set $8
  local.get $12
  f32.load $0 offset=76
  local.set $29
  local.get $12
  f32.load $0 offset=80
  local.set $30
  local.get $12
  f32.load $0 offset=108
  local.set $31
  local.get $12
  f32.load $0 offset=84
  local.set $32
  local.get $12
  f32.load $0 offset=88
  local.set $22
  local.get $12
  f32.load $0 offset=124
  local.set $23
  local.get $12
  i32.load $0 offset=92
  local.set $19
  local.get $12
  f32.load $0 offset=96
  local.set $33
  f32.const 0.9900000095367432
  f32.const 20
  global.get $dsp/voices/sr
  f32.const 0.44999998807907104
  f32.mul
  local.tee $13
  local.get $12
  f32.load $0 offset=20
  local.tee $38
  local.get $13
  local.get $38
  f32.lt
  select
  local.get $38
  f32.const 20
  f32.lt
  select
  local.tee $13
  local.get $13
  f32.add
  global.get $dsp/voices/isr
  local.tee $13
  f32.mul
  local.tee $24
  local.get $24
  f32.const 0.9900000095367432
  f32.gt
  select
  local.set $24
  f32.const 1
  f32.const 0
  f32.const 1
  local.get $12
  f32.load $0 offset=24
  local.tee $43
  local.get $43
  f32.const 1
  f32.gt
  select
  local.get $43
  f32.const 0
  f32.lt
  select
  f32.const 0.9599999785423279
  f32.mul
  f32.sub
  f32.const 2
  f32.mul
  local.set $34
  f32.const 10
  local.get $13
  local.get $12
  f32.load $0 offset=44
  local.tee $13
  f32.div
  local.get $13
  f32.const 5.000000237487257e-04
  f32.le
  select
  local.set $35
  local.get $12
  f32.load $0 offset=48
  local.tee $13
  f32.const 5.000000237487257e-04
  f32.le
  if (result f32)
   f32.const 10
  else
   f32.const 1
   local.get $11
   f32.sub
   global.get $dsp/voices/isr
   f32.mul
   local.get $13
   f32.div
  end
  local.set $36
  local.get $12
  i32.load $0 offset=112
  local.set $7
  local.get $12
  i32.load $0 offset=116
  local.tee $5
  i32.const 2
  i32.lt_s
  if
   i32.const 2
   local.set $5
  end
  local.get $5
  i32.const 4096
  i32.gt_s
  if
   i32.const 4096
   local.set $5
  end
  f32.const 10
  global.get $dsp/voices/isr
  local.get $6
  f32.div
  local.get $6
  f32.const 5.000000237487257e-04
  f32.le
  select
  local.set $37
  local.get $0
  i32.const 14
  i32.shl
  i32.const 65536
  i32.add
  local.set $25
  f32.const 0
  f32.const 0.949999988079071
  local.get $38
  local.get $38
  f32.const 0.949999988079071
  f32.gt
  select
  local.get $38
  f32.const 0
  f32.lt
  select
  local.set $38
  f32.const 0.800000011920929
  f32.const 0.9999989867210388
  local.get $43
  local.get $43
  f32.const 0.9999989867210388
  f32.gt
  select
  local.get $43
  f32.const 0.800000011920929
  f32.lt
  select
  local.set $39
  local.get $1
  i32.const 13
  i32.shl
  i32.const 4096
  i32.add
  local.set $40
  global.get $dsp/voices/sr
  f32.const 0.5
  f32.mul
  local.set $41
  i32.const 0
  local.set $0
  loop $for-loop|0
   local.get $0
   local.get $2
   i32.lt_s
   if
    local.get $19
    i32.const 0
    i32.gt_s
    if
     local.get $4
     local.get $33
     f32.add
     local.get $26
     local.get $19
     i32.const 1
     i32.sub
     local.tee $19
     select
     local.set $4
    end
    f32.const 1
    local.get $41
    f32.const 0.9200000166893005
    f32.mul
    local.tee $47
    local.get $4
    local.get $20
    f32.const 0.009999999776482582
    f32.gt
    local.get $21
    f32.const 9.999999747378752e-05
    f32.gt
    i32.and
    if (result f32)
     f32.const 1
     local.set $13
     local.get $8
     local.get $20
     global.get $dsp/voices/isr
     f32.mul
     f32.add
     local.tee $8
     f32.const 1
     f32.ge
     if
      local.get $8
      f32.const -1
      f32.add
      local.set $8
     end
     local.get $8
     local.get $8
     f64.promote_f32
     f64.floor
     f32.demote_f64
     f32.sub
     f32.const 6.2831854820251465
     f32.mul
     local.tee $6
     f32.const 3.1415927410125732
     f32.gt
     if
      f32.const -1
      local.set $13
      local.get $6
      f32.const -3.1415927410125732
      f32.add
      local.set $6
     end
     local.get $6
     f32.const 1.5707963705062866
     f32.gt
     if
      f32.const 3.1415927410125732
      local.get $6
      f32.sub
      local.set $6
     end
     local.get $6
     local.get $6
     local.get $6
     f32.mul
     local.tee $42
     f32.mul
     local.tee $44
     local.get $42
     f32.mul
     local.tee $45
     local.get $42
     f32.mul
     local.set $46
     local.get $21
     local.get $13
     local.get $6
     local.get $44
     f32.const 0.1666666716337204
     f32.mul
     f32.sub
     local.get $45
     f32.const 0.008333333767950535
     f32.mul
     f32.add
     local.get $46
     f32.const 1.9841270113829523e-04
     f32.mul
     f32.sub
     local.get $46
     local.get $42
     f32.mul
     f32.const 2.7557318844628753e-06
     f32.mul
     f32.add
     f32.mul
     f32.mul
     f32.const 0.05779999867081642
     f32.mul
     f32.const 1
     f32.add
    else
     f32.const 1
    end
    f32.mul
    local.tee $6
    local.get $6
    local.get $47
    f32.gt
    select
    local.get $6
    f32.const 1
    f32.lt
    select
    local.set $42
    local.get $14
    i32.const 1
    i32.eq
    if (result f32)
     local.get $3
     local.get $42
     global.get $dsp/voices/isr
     f32.mul
     local.tee $6
     f32.add
     local.tee $3
     f32.const 1
     f32.ge
     if
      local.get $3
      f32.const -1
      f32.add
      local.set $3
     end
     local.get $3
     local.get $3
     f32.add
     f32.const -1
     f32.add
     block $dsp/voices/blep|inlined.0 (result f32)
      local.get $3
      local.get $6
      f32.lt
      if
       local.get $3
       local.get $6
       f32.div
       local.tee $6
       local.get $6
       f32.add
       local.get $6
       local.get $6
       f32.mul
       f32.sub
       f32.const -1
       f32.add
       br $dsp/voices/blep|inlined.0
      end
      local.get $3
      f32.const 1
      local.get $6
      f32.sub
      f32.gt
      if
       local.get $3
       f32.const -1
       f32.add
       local.get $6
       f32.div
       local.tee $6
       local.get $6
       f32.mul
       local.get $6
       f32.add
       local.get $6
       f32.add
       f32.const 1
       f32.add
       br $dsp/voices/blep|inlined.0
      end
      f32.const 0
     end
     f32.sub
    else
     local.get $14
     i32.const 2
     i32.eq
     if (result f32)
      local.get $3
      local.get $42
      global.get $dsp/voices/isr
      f32.mul
      local.tee $13
      f32.add
      local.tee $3
      f32.const 1
      f32.ge
      if
       local.get $3
       f32.const -1
       f32.add
       local.set $3
      end
      f32.const 1
      f32.const -1
      local.get $3
      local.get $23
      f32.lt
      select
      block $dsp/voices/blep|inlined.1 (result f32)
       local.get $3
       local.get $13
       f32.lt
       if
        local.get $3
        local.get $13
        f32.div
        local.tee $6
        local.get $6
        f32.add
        local.get $6
        local.get $6
        f32.mul
        f32.sub
        f32.const -1
        f32.add
        br $dsp/voices/blep|inlined.1
       end
       local.get $3
       f32.const 1
       local.get $13
       f32.sub
       f32.gt
       if
        local.get $3
        f32.const -1
        f32.add
        local.get $13
        f32.div
        local.tee $6
        local.get $6
        f32.mul
        local.get $6
        f32.add
        local.get $6
        f32.add
        f32.const 1
        f32.add
        br $dsp/voices/blep|inlined.1
       end
       f32.const 0
      end
      f32.add
      block $dsp/voices/blep|inlined.2 (result f32)
       local.get $3
       f32.const 1
       f32.add
       local.get $23
       f32.sub
       local.tee $6
       f32.const 1
       f32.ge
       if
        local.get $6
        f32.const -1
        f32.add
        local.set $6
       end
       local.get $6
       local.get $13
       f32.lt
       if
        local.get $6
        local.get $13
        f32.div
        local.tee $6
        local.get $6
        f32.add
        local.get $6
        local.get $6
        f32.mul
        f32.sub
        f32.const -1
        f32.add
        br $dsp/voices/blep|inlined.2
       end
       local.get $6
       f32.const 1
       local.get $13
       f32.sub
       f32.gt
       if
        local.get $6
        f32.const -1
        f32.add
        local.get $13
        f32.div
        local.tee $6
        local.get $6
        f32.mul
        local.get $6
        f32.add
        local.get $6
        f32.add
        f32.const 1
        f32.add
        br $dsp/voices/blep|inlined.2
       end
       f32.const 0
      end
      f32.sub
      f32.const 0.699999988079071
      f32.mul
     else
      local.get $14
      i32.const 3
      i32.eq
      if (result f32)
       local.get $3
       local.get $42
       global.get $dsp/voices/isr
       f32.mul
       f32.add
       local.tee $3
       f32.const 1
       f32.ge
       if
        local.get $3
        f32.const -1
        f32.add
        local.set $3
       end
       local.get $3
       f32.const 0.5
       f32.lt
       if (result f32)
        local.get $3
        f32.const 4
        f32.mul
        f32.const -1
        f32.add
       else
        f32.const 3
        local.get $3
        f32.const 4
        f32.mul
        f32.sub
       end
       f32.const 0.8999999761581421
       f32.mul
      else
       local.get $14
       i32.const 4
       i32.eq
       if (result f32)
        f32.const 1
        local.set $13
        local.get $3
        local.get $42
        global.get $dsp/voices/isr
        f32.mul
        f32.add
        local.tee $3
        f32.const 1
        f32.ge
        if
         local.get $3
         f32.const -1
         f32.add
         local.set $3
        end
        local.get $3
        local.get $3
        f64.promote_f32
        f64.floor
        f32.demote_f64
        f32.sub
        f32.const 6.2831854820251465
        f32.mul
        local.tee $6
        f32.const 3.1415927410125732
        f32.gt
        if
         f32.const -1
         local.set $13
         local.get $6
         f32.const -3.1415927410125732
         f32.add
         local.set $6
        end
        local.get $6
        f32.const 1.5707963705062866
        f32.gt
        if
         f32.const 3.1415927410125732
         local.get $6
         f32.sub
         local.set $6
        end
        local.get $6
        local.get $6
        local.get $6
        f32.mul
        local.tee $42
        f32.mul
        local.tee $44
        local.get $42
        f32.mul
        local.tee $45
        local.get $42
        f32.mul
        local.set $46
        local.get $13
        local.get $6
        local.get $44
        f32.const 0.1666666716337204
        f32.mul
        f32.sub
        local.get $45
        f32.const 0.008333333767950535
        f32.mul
        f32.add
        local.get $46
        f32.const 1.9841270113829523e-04
        f32.mul
        f32.sub
        local.get $46
        local.get $42
        f32.mul
        f32.const 2.7557318844628753e-06
        f32.mul
        f32.add
        f32.mul
       else
        local.get $14
        i32.const 5
        i32.eq
        if (result f32)
         local.get $12
         i32.load $0 offset=100
         local.tee $1
         local.get $1
         i32.const 13
         i32.shl
         i32.xor
         local.tee $1
         local.get $1
         i32.const 17
         i32.shr_u
         i32.xor
         local.tee $1
         local.get $1
         i32.const 5
         i32.shl
         i32.xor
         local.tee $1
         i32.eqz
         if
          i32.const -1640531527
          local.set $1
         end
         local.get $12
         local.get $1
         i32.store $0 offset=100
         local.get $1
         f32.convert_i32_u
         f32.const 2.3283064365386963e-10
         f32.mul
         f32.const 2
         f32.mul
         f32.const -1
         f32.add
        else
         local.get $14
         i32.const 6
         i32.eq
         if (result f32)
          f32.const 1
          local.set $13
          local.get $9
          local.get $42
          local.get $30
          f32.mul
          global.get $dsp/voices/isr
          f32.mul
          f32.add
          local.tee $9
          f32.const 1
          f32.ge
          if
           local.get $9
           f32.const -1
           f32.add
           local.set $9
          end
          local.get $9
          local.get $31
          local.get $16
          f32.mul
          f32.const 0.15915493667125702
          f32.mul
          f32.add
          local.tee $6
          local.get $6
          f64.promote_f32
          f64.floor
          f32.demote_f64
          f32.sub
          f32.const 6.2831854820251465
          f32.mul
          local.tee $6
          f32.const 3.1415927410125732
          f32.gt
          if
           f32.const -1
           local.set $13
           local.get $6
           f32.const -3.1415927410125732
           f32.add
           local.set $6
          end
          local.get $6
          f32.const 1.5707963705062866
          f32.gt
          if
           f32.const 3.1415927410125732
           local.get $6
           f32.sub
           local.set $6
          end
          local.get $6
          local.get $6
          local.get $6
          f32.mul
          local.tee $16
          f32.mul
          local.tee $44
          local.get $16
          f32.mul
          local.tee $45
          local.get $16
          f32.mul
          local.set $46
          local.get $13
          local.get $6
          local.get $44
          f32.const 0.1666666716337204
          f32.mul
          f32.sub
          local.get $45
          f32.const 0.008333333767950535
          f32.mul
          f32.add
          local.get $46
          f32.const 1.9841270113829523e-04
          f32.mul
          f32.sub
          local.get $46
          local.get $16
          f32.mul
          f32.const 2.7557318844628753e-06
          f32.mul
          f32.add
          f32.mul
          local.set $16
          f32.const 1
          local.set $13
          local.get $3
          local.get $42
          global.get $dsp/voices/isr
          f32.mul
          f32.add
          local.tee $3
          f32.const 1
          f32.ge
          if
           local.get $3
           f32.const -1
           f32.add
           local.set $3
          end
          local.get $3
          local.get $29
          local.get $16
          f32.mul
          f32.const 0.15915493667125702
          f32.mul
          f32.add
          local.tee $6
          local.get $6
          f64.promote_f32
          f64.floor
          f32.demote_f64
          f32.sub
          f32.const 6.2831854820251465
          f32.mul
          local.tee $6
          f32.const 3.1415927410125732
          f32.gt
          if
           f32.const -1
           local.set $13
           local.get $6
           f32.const -3.1415927410125732
           f32.add
           local.set $6
          end
          local.get $6
          f32.const 1.5707963705062866
          f32.gt
          if
           f32.const 3.1415927410125732
           local.get $6
           f32.sub
           local.set $6
          end
          local.get $6
          local.get $6
          local.get $6
          f32.mul
          local.tee $42
          f32.mul
          local.tee $44
          local.get $42
          f32.mul
          local.tee $45
          local.get $42
          f32.mul
          local.set $46
          local.get $13
          local.get $6
          local.get $44
          f32.const 0.1666666716337204
          f32.mul
          f32.sub
          local.get $45
          f32.const 0.008333333767950535
          f32.mul
          f32.add
          local.get $46
          f32.const 1.9841270113829523e-04
          f32.mul
          f32.sub
          local.get $46
          local.get $42
          f32.mul
          f32.const 2.7557318844628753e-06
          f32.mul
          f32.add
          f32.mul
         else
          local.get $14
          i32.const 7
          i32.eq
          if (result f32)
           local.get $3
           local.get $42
           global.get $dsp/voices/isr
           f32.mul
           local.tee $13
           f32.add
           local.tee $3
           f32.const 1
           f32.ge
           if
            local.get $3
            f32.const -1
            f32.add
            local.set $3
           end
           local.get $3
           local.get $32
           f32.const 5.939999828115106e-04
           f32.mul
           local.tee $42
           f32.sub
           local.tee $6
           f32.const 0
           f32.lt
           if
            local.get $6
            f32.const 1
            f32.add
            local.set $6
           end
           local.get $3
           local.get $42
           f32.add
           local.tee $42
           f32.const -1
           f32.add
           local.get $42
           local.get $42
           f32.const 1
           f32.ge
           select
           local.set $42
           local.get $3
           local.get $3
           f32.add
           f32.const -1
           f32.add
           block $dsp/voices/blep|inlined.3 (result f32)
            local.get $3
            local.get $13
            f32.lt
            if
             local.get $3
             local.get $13
             f32.div
             local.tee $44
             local.get $44
             f32.add
             local.get $44
             local.get $44
             f32.mul
             f32.sub
             f32.const -1
             f32.add
             br $dsp/voices/blep|inlined.3
            end
            local.get $3
            f32.const 1
            local.get $13
            f32.sub
            f32.gt
            if
             local.get $3
             f32.const -1
             f32.add
             local.get $13
             f32.div
             local.tee $44
             local.get $44
             f32.mul
             local.get $44
             f32.add
             local.get $44
             f32.add
             f32.const 1
             f32.add
             br $dsp/voices/blep|inlined.3
            end
            f32.const 0
           end
           f32.sub
           f32.const 0.5
           f32.mul
           local.get $6
           local.get $6
           f32.add
           f32.const -1
           f32.add
           block $dsp/voices/blep|inlined.4 (result f32)
            local.get $6
            local.get $13
            f32.lt
            if
             local.get $6
             local.get $13
             f32.div
             local.tee $6
             local.get $6
             f32.add
             local.get $6
             local.get $6
             f32.mul
             f32.sub
             f32.const -1
             f32.add
             br $dsp/voices/blep|inlined.4
            end
            local.get $6
            f32.const 1
            local.get $13
            f32.sub
            f32.gt
            if
             local.get $6
             f32.const -1
             f32.add
             local.get $13
             f32.div
             local.tee $6
             local.get $6
             f32.mul
             local.get $6
             f32.add
             local.get $6
             f32.add
             f32.const 1
             f32.add
             br $dsp/voices/blep|inlined.4
            end
            f32.const 0
           end
           f32.sub
           f32.const 0.25
           f32.mul
           f32.add
           local.get $42
           local.get $42
           f32.add
           f32.const -1
           f32.add
           block $dsp/voices/blep|inlined.5 (result f32)
            local.get $13
            local.get $42
            f32.gt
            if
             local.get $42
             local.get $13
             f32.div
             local.tee $6
             local.get $6
             f32.add
             local.get $6
             local.get $6
             f32.mul
             f32.sub
             f32.const -1
             f32.add
             br $dsp/voices/blep|inlined.5
            end
            local.get $42
            f32.const 1
            local.get $13
            f32.sub
            f32.gt
            if
             local.get $42
             f32.const -1
             f32.add
             local.get $13
             f32.div
             local.tee $6
             local.get $6
             f32.mul
             local.get $6
             f32.add
             local.get $6
             f32.add
             f32.const 1
             f32.add
             br $dsp/voices/blep|inlined.5
            end
            f32.const 0
           end
           f32.sub
           f32.const 0.25
           f32.mul
           f32.add
           local.set $44
           local.get $22
           f32.const 1.0000000474974513e-03
           f32.gt
           if (result f32)
            f32.const 1
            local.set $13
            local.get $3
            f32.const 0.5
            f32.mul
            local.tee $6
            local.get $6
            f64.promote_f32
            f64.floor
            f32.demote_f64
            f32.sub
            f32.const 6.2831854820251465
            f32.mul
            local.tee $6
            f32.const 3.1415927410125732
            f32.gt
            if
             f32.const -1
             local.set $13
             local.get $6
             f32.const -3.1415927410125732
             f32.add
             local.set $6
            end
            local.get $6
            f32.const 1.5707963705062866
            f32.gt
            if
             f32.const 3.1415927410125732
             local.get $6
             f32.sub
             local.set $6
            end
            local.get $6
            local.get $6
            local.get $6
            f32.mul
            local.tee $45
            f32.mul
            local.tee $46
            local.get $45
            f32.mul
            local.tee $47
            local.get $45
            f32.mul
            local.set $42
            local.get $44
            local.get $13
            local.get $6
            local.get $46
            f32.const 0.1666666716337204
            f32.mul
            f32.sub
            local.get $47
            f32.const 0.008333333767950535
            f32.mul
            f32.add
            local.get $42
            f32.const 1.9841270113829523e-04
            f32.mul
            f32.sub
            local.get $42
            local.get $45
            f32.mul
            f32.const 2.7557318844628753e-06
            f32.mul
            f32.add
            f32.mul
            local.get $22
            f32.mul
            f32.const 0.800000011920929
            f32.mul
            f32.add
           else
            local.get $44
           end
           f32.const 0.6000000238418579
           f32.mul
          else
           local.get $14
           i32.const 8
           i32.eq
           if (result f32)
            local.get $5
            local.get $7
            i32.const 1
            i32.add
            local.tee $1
            i32.le_s
            if
             i32.const 0
             local.set $1
            end
            local.get $39
            local.get $25
            local.get $7
            i32.const 2
            i32.shl
            i32.add
            local.tee $48
            f32.load $0
            f32.const 1
            local.get $38
            f32.const 0.5
            f32.mul
            local.tee $6
            f32.sub
            f32.mul
            local.get $25
            local.get $1
            i32.const 2
            i32.shl
            i32.add
            f32.load $0
            local.get $6
            f32.mul
            f32.add
            f32.mul
            local.set $6
            local.get $48
            local.get $6
            f32.store $0
            local.get $1
            local.set $7
            local.get $6
            f32.const 1.5
            f32.mul
           else
            f32.const 0
           end
          end
         end
        end
       end
      end
     end
    end
    local.set $6
    local.get $40
    local.get $0
    i32.const 2
    i32.shl
    i32.add
    local.tee $1
    f32.load $0
    local.set $13
    local.get $1
    local.get $13
    local.get $14
    i32.const 0
    i32.ne
    local.get $14
    i32.const 8
    i32.ne
    i32.and
    if (result f32)
     local.get $17
     local.get $24
     local.get $18
     local.get $24
     local.get $6
     local.get $17
     f32.sub
     local.get $34
     local.get $18
     f32.mul
     f32.sub
     f32.mul
     f32.add
     local.tee $18
     f32.mul
     f32.add
     local.tee $17
     f32.const 0
     f32.const 1
     local.get $43
     local.get $43
     f32.const 1
     f32.gt
     select
     local.get $43
     f32.const 0
     f32.lt
     select
     f32.const 0.4000000059604645
     f32.mul
     f32.const 1
     f32.add
     f32.mul
    else
     local.get $6
    end
    local.get $15
    i32.const 1
    i32.eq
    if (result f32)
     local.get $10
     local.get $35
     f32.add
     local.tee $6
     f32.const 1
     f32.ge
     if (result f32)
      i32.const 2
      local.set $15
      f32.const 1
     else
      local.get $6
     end
    else
     local.get $15
     i32.const 2
     i32.eq
     if (result f32)
      local.get $10
      local.get $36
      f32.sub
      local.tee $6
      local.get $11
      f32.le
      if (result f32)
       i32.const 3
       local.set $15
       local.get $11
      else
       local.get $6
      end
     else
      local.get $15
      i32.const 4
      i32.eq
      if (result f32)
       local.get $10
       local.get $27
       local.get $37
       f32.mul
       f32.sub
       local.tee $6
       f32.const 0
       f32.le
       if (result f32)
        i32.const 0
        local.set $15
        f32.const 0
       else
        local.get $6
       end
      else
       local.get $10
      end
     end
    end
    local.tee $10
    f32.mul
    local.get $28
    f32.mul
    f32.add
    f32.store $0
    local.get $0
    local.get $2
    local.get $15
    select
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|0
   end
  end
  local.get $12
  local.get $4
  f32.store $0 offset=4
  local.get $12
  local.get $3
  f32.store $0 offset=12
  local.get $12
  local.get $9
  f32.store $0 offset=16
  local.get $12
  local.get $16
  f32.store $0 offset=104
  local.get $12
  local.get $17
  f32.store $0 offset=28
  local.get $12
  local.get $18
  f32.store $0 offset=32
  local.get $12
  local.get $15
  i32.store $0 offset=36
  local.get $12
  local.get $10
  f32.store $0 offset=40
  local.get $12
  local.get $8
  f32.store $0 offset=72
  local.get $12
  local.get $19
  i32.store $0 offset=92
  local.get $12
  local.get $7
  i32.store $0 offset=112
 )
 (func $~start
  f32.const 2.2675736545352265e-05
  global.set $dsp/voices/isr
 )
)
