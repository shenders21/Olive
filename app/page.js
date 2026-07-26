'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  MapPin, Check, ChevronRight, Camera, X, Heart, HandshakeIcon, Briefcase,
  LogOut, Sparkles, Users, EyeOff, Clock, ArrowRight, Loader2, Shield, AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'

// ---------- Small primitives ----------
// Wordmark uses the real brand asset (transparent PNG). Sizes are height-based.
const OliveWordmark = ({ size = 'md' }) => {
  const heights = { sm: 26, md: 40, lg: 64 }
  const h = heights[size] || heights.md
  return (
    <img
      src="/olive_wordmark.png"
      alt="Olive"
      style={{ height: h, width: 'auto' }}
      className="block select-none"
      draggable={false}
    />
  )
}

const Shell = ({ children, dark }) => (
  <div className={`min-h-screen w-full ${dark ? 'olive-gradient text-cream' : 'paper text-olive-deep'}`}>
    <div className="mx-auto w-full max-w-md px-5 pt-14 pb-10 safe-top safe-bottom">
      {children}
    </div>
  </div>
)

const BrandHeader = ({ dark }) => (
  <div className="flex items-center justify-center pb-6">
    <OliveWordmark size="md" />
  </div>
)

const SectionTitle = ({ children, sub, dark }) => (
  <div className={`text-center pb-6 ${dark ? 'text-cream' : 'text-olive-deep'}`}>
    <h1 className={`font-serif text-3xl leading-tight ${dark ? 'text-cream' : 'text-olive-deep'}`}>{children}</h1>
    {sub && <p className={`mt-2 text-sm ${dark ? 'text-cream/70' : 'text-olive/70'}`}>{sub}</p>}
    <div className="mx-auto mt-4 h-px w-16 gold-line" />
  </div>
)

// ---------- API helper ----------
const api = async (path, opts = {}) => {
  const res = await fetch(`/api/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'request failed')
  return data
}

// ---------- Photo resize ----------
async function fileToResizedDataUrl(file, maxSide = 480, quality = 0.72) {
  const reader = new FileReader()
  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl })
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

// ---------- Main App ----------
function App() {
  const [screen, setScreen] = useState('boot') // boot | checkin | onboarding | venue
  const [userId, setUserId] = useState(null)
  const [venues, setVenues] = useState([])
  const [located, setLocated] = useState(false)
  const [locationStatus, setLocationStatus] = useState('idle') // idle | asking | ok | denied | unavailable
  const [venue, setVenue] = useState(null) // current checked-in venue
  const [profile, setProfile] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [matchOverlay, setMatchOverlay] = useState(null) // { other, me, matchId }
  const [showSafety, setShowSafety] = useState(false)
  const [showGuidelines, setShowGuidelines] = useState(false)

  // Ask for browser geolocation with a hard timeout. Resolves to {lat,lng} or null.
  const getPosition = () => new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unavailable'); return resolve(null)
    }
    setLocationStatus('asking')
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true; setLocationStatus('unavailable'); resolve(null)
    }, 8000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return
        done = true; clearTimeout(timer)
        setLocationStatus('ok')
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (e) => {
        if (done) return
        done = true; clearTimeout(timer)
        setLocationStatus(e.code === 1 ? 'denied' : 'unavailable')
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    )
  })

  const refreshVenues = async (coords) => {
    const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ''
    const vr = await api(`venues${qs}`)
    setVenues(vr.venues || [])
    setLocated(!!vr.located)
  }

  // Boot: create session + fetch venues (with location if available)
  useEffect(() => {
    (async () => {
      try {
        let uid = null
        if (typeof window !== 'undefined') uid = localStorage.getItem('ob_userId')
        if (!uid) {
          const r = await api('session/init', { method: 'POST', body: {} })
          uid = r.userId
          localStorage.setItem('ob_userId', uid)
        }
        setUserId(uid)

        try {
          const pr = await api(`profile/${uid}`)
          if (pr.user && pr.user.firstName) setProfile(pr.user)
        } catch {}

        // Kick off location request in parallel with a first venues fetch
        await refreshVenues(null)
        setScreen('checkin')
        const coords = await getPosition()
        if (coords) await refreshVenues(coords)
      } catch (e) {
        toast.error('Could not start session. Retry.')
      }
    })()
  }, [])

  const checkIn = async (v) => {
    try {
      const r = await api('checkin', { method: 'POST', body: { userId, venueId: v.id } })
      setVenue(r.venue)
      if (profile && profile.firstName) setScreen('venue')
      else setScreen('onboarding')
    } catch (e) { toast.error(e.message) }
  }

  const leaveVenue = async () => {
    try {
      await api('leave', { method: 'POST', body: { userId } })
      setVenue(null); setScreen('checkin')
      toast.success('Left venue. See you next time.')
    } catch {}
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {screen === 'boot' && (
          <motion.div key="boot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Shell dark>
              <BrandHeader dark />
              <div className="flex flex-col items-center justify-center pt-24 text-cream/70">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="mt-4 font-serif italic">Setting the table…</p>
              </div>
            </Shell>
          </motion.div>
        )}

        {screen === 'checkin' && (
          <motion.div key="checkin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <CheckIn
              venues={venues}
              located={located}
              locationStatus={locationStatus}
              showPicker={showPicker}
              setShowPicker={setShowPicker}
              onConfirm={checkIn}
            />
          </motion.div>
        )}

        {screen === 'onboarding' && (
          <motion.div key="onb" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Onboarding
              venue={venue}
              existing={profile}
              onDone={async (payload) => {
                const r = await api('profile', { method: 'POST', body: { userId, ...payload } })
                setProfile(r.user)
                setScreen('venue')
              }}
            />
          </motion.div>
        )}

        {screen === 'venue' && (
          <motion.div key="venue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <VenueFeed
              userId={userId}
              venue={venue}
              profile={profile}
              onLeave={leaveVenue}
              onMatch={(payload) => setMatchOverlay(payload)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {matchOverlay && (
          <MatchReveal
            key="match"
            userId={userId}
            payload={matchOverlay}
            venue={venue}
            onClose={() => setMatchOverlay(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ---------- Check-in ----------
function CheckIn({ venues, located, locationStatus, showPicker, setShowPicker, onConfirm, onOpenSafety, onOpenGuidelines }) {
  // Determine primary candidate: nearest venue that is 'nearby' (within its radius)
  const nearby = venues.filter(v => v.nearby)
  const primary = nearby[0] || venues[0]
  const others = venues.filter(v => v.id !== primary?.id)
  const showAsAppearsToBe = nearby.length >= 1 && !showPicker
  const noNearbyMessage = located && nearby.length === 0

  const formatDistance = (d) => {
    if (d == null) return null
    if (d < 1000) return `${d}m away`
    return `${(d / 1000).toFixed(1)}km away`
  }

  return (
    <Shell>
      <BrandHeader />
      <SectionTitle sub="A quieter way to meet the people in the room.">
        Welcome
      </SectionTitle>

      {/* Location status line */}
      <div className="text-center -mt-4 mb-4 text-[11px] uppercase tracking-[0.2em]">
        {locationStatus === 'asking' && (
          <span className="text-olive/50 inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Finding your venue</span>
        )}
        {locationStatus === 'ok' && nearby.length > 0 && (
          <span className="text-gold-dark">Located · {nearby.length} nearby</span>
        )}
        {locationStatus === 'ok' && nearby.length === 0 && (
          <span className="text-olive/50">Located · no Olive venues in range</span>
        )}
        {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
          <span className="text-olive/50">Location off · choose your venue below</span>
        )}
      </div>

      {showAsAppearsToBe && primary ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="rounded-2xl border border-olive/15 bg-cream shadow-[0_1px_0_rgba(61,74,42,0.08)] overflow-hidden">
            <div className="olive-gradient text-cream px-5 py-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-gold-light" />
              <div className="flex-1">
                <div className="text-xs uppercase tracking-[0.15em] text-cream/70">You appear to be at</div>
                <div className="font-serif text-2xl leading-tight">{primary.name}</div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-1.5">
              <div className="text-sm text-olive/80">{primary.area}</div>
              <div className="text-xs text-olive/60">{primary.address}</div>
              <div className="flex items-center justify-between pt-2 text-xs text-olive/70">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold inline-block" />
                  <span>{primary.liveCount} people here right now</span>
                </div>
                {primary.distance != null && (
                  <span className="text-olive/50">{formatDistance(primary.distance)}</span>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
              <Button
                onClick={() => onConfirm(primary)}
                className="w-full bg-olive hover:bg-olive-deep text-cream h-12 rounded-full text-base"
              >
                <Check className="h-4 w-4 mr-2" /> Yes, I&apos;m at {primary.name}
              </Button>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs uppercase tracking-[0.15em] text-olive/60 hover:text-olive py-2"
              >
                Choose another venue
              </button>
            </div>
          </div>
          {nearby.length > 1 && (
            <div className="mt-3 text-center text-[11px] text-olive/50">
              {nearby.length - 1} other Olive {nearby.length - 1 === 1 ? 'venue is' : 'venues are'} within a short walk
            </div>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-olive/70">
            {noNearbyMessage
              ? 'No Olive venues within 150m. Pick where you are:'
              : "Choose the venue you're in."}
          </p>
          {venues.map(v => (
            <button key={v.id} onClick={() => onConfirm(v)}
              className={`w-full rounded-2xl border bg-cream px-5 py-4 flex items-center gap-3 hover:border-gold/60 transition-colors text-left ${v.nearby ? 'border-gold/60' : 'border-olive/15'}`}>
              <MapPin className={`h-5 w-5 ${v.nearby ? 'text-gold-dark' : 'text-olive/60'}`} />
              <div className="flex-1">
                <div className="font-serif text-xl leading-tight flex items-center gap-2">
                  {v.name}
                  {v.nearby && <span className="text-[10px] uppercase tracking-[0.15em] text-gold-dark">Here</span>}
                </div>
                <div className="text-xs text-olive/60">
                  {v.area} · {v.liveCount} here now
                  {v.distance != null && <> · {formatDistance(v.distance)}</>}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-olive/40" />
            </button>
          ))}
          {showPicker && (
            <button onClick={() => setShowPicker(false)} className="w-full text-xs uppercase tracking-[0.15em] text-olive/60 hover:text-olive py-2">
              Back
            </button>
          )}
        </div>
      )}

      <div className="pt-8 text-center text-[10px] text-olive/40 max-w-xs mx-auto leading-relaxed">
        Location is used only to find your venue. It is never stored on our servers.
      </div>

      <div className="pt-6 text-center text-[11px] uppercase tracking-[0.2em] text-olive/40">
        Real people · Real connections · Be kind, have fun
      </div>

      <div className="pt-4 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.2em]">
        <button onClick={onOpenSafety} className="flex items-center gap-1 text-olive/50 hover:text-olive">
          <Shield className="h-3 w-3" /> Ask for Angela
        </button>
        <span className="text-olive/20">·</span>
        <button onClick={onOpenGuidelines} className="text-olive/50 hover:text-olive">
          Community guidelines
        </button>
      </div>

      <div className="pt-6 text-center">
        <button
          onClick={() => {
            if (typeof window === 'undefined') return
            try { localStorage.clear() } catch {}
            window.location.reload()
          }}
          className="text-[10px] uppercase tracking-[0.2em] text-olive/40 hover:text-olive underline-offset-4 hover:underline"
        >
          Start fresh
        </button>
      </div>
    </Shell>
  )
}

// ---------- Onboarding ----------
function Onboarding({ venue, existing, onDone, onOpenGuidelines, onOpenSafety }) {
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState(existing?.firstName || '')
  const [age, setAge] = useState(existing?.age || 28)
  const [gender, setGender] = useState(existing?.gender || 'female')
  const [photo, setPhoto] = useState(existing?.photo || null)
  const [bio, setBio] = useState(existing?.bio || '')
  const [modes, setModes] = useState(existing?.modes || ['dating'])
  const [interestedIn, setInterestedIn] = useState(existing?.datingPrefs?.interestedIn || 'male')
  const [ageRange, setAgeRange] = useState([existing?.datingPrefs?.ageMin || 25, existing?.datingPrefs?.ageMax || 40])
  const [partySize, setPartySize] = useState(existing?.friendProfile?.partySize || 1)
  const [role, setRole] = useState(existing?.networkingProfile?.role || '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const toggleMode = (m) => setModes(x => x.includes(m) ? x.filter(y => y !== m) : [...x, m])

  const onPickFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const dataUrl = await fileToResizedDataUrl(f)
      setPhoto(dataUrl)
    } catch {
      toast.error('Could not read that image.')
    }
  }

  const usePlaceholder = () => {
    const n = Math.floor(Math.random() * 90) + 1
    const bucket = gender === 'male' ? 'men' : 'women'
    setPhoto(`https://randomuser.me/api/portraits/${bucket}/${n}.jpg`)
  }

  const finish = async () => {
    setBusy(true)
    try {
      const payload = {
        firstName, age, gender, bio, photo,
        modes: modes.length ? modes : ['dating'],
        datingPrefs: modes.includes('dating') ? { interestedIn, ageMin: ageRange[0], ageMax: ageRange[1] } : null,
        friendProfile: modes.includes('friends') ? { partySize } : null,
        networkingProfile: modes.includes('networking') ? { role } : null,
      }
      await onDone(payload)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  // Build dynamic step list based on modes selected
  const baseSteps = ['name', 'photo', 'modes']
  const dynamicSteps = [
    ...baseSteps,
    ...(modes.includes('dating') ? ['dating'] : []),
    ...(modes.includes('friends') ? ['friends'] : []),
    ...(modes.includes('networking') ? ['networking'] : []),
  ]
  const currentStepName = dynamicSteps[step]

  const canNext = () => {
    if (currentStepName === 'name') return firstName.trim().length >= 1 && age >= 18 && age <= 99 && gender
    if (currentStepName === 'photo') return !!photo
    if (currentStepName === 'modes') return modes.length > 0
    if (currentStepName === 'dating') return true
    if (currentStepName === 'friends') return partySize >= 1 && partySize <= 8
    if (currentStepName === 'networking') return role.trim().length >= 2
    return false
  }

  const progress = Math.round(((step + 1) / dynamicSteps.length) * 100)

  return (
    <Shell>
      <BrandHeader />
      <div className="mb-4">
        <div className="text-center text-[11px] uppercase tracking-[0.2em] text-olive/50 mb-2">
          At {venue?.name} · Step {step + 1} of {dynamicSteps.length}
        </div>
        <div className="h-[2px] bg-olive/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-gold" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentStepName === 'name' && (
          <motion.div key="s-name" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="Just enough to say hello.">The basics</SectionTitle>
            <div className="space-y-5">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-olive/60">First name</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Alex"
                  className="mt-2 h-12 bg-cream border-olive/20 focus-visible:ring-gold text-lg font-serif" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs uppercase tracking-[0.15em] text-olive/60">Age</Label>
                  <span className="font-serif text-2xl">{age}</span>
                </div>
                <Slider min={18} max={70} step={1} value={[age]} onValueChange={([v]) => setAge(v)} className="mt-3" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-olive/60 mb-2 block">Gender</Label>
                <RadioGroup value={gender} onValueChange={setGender} className="grid grid-cols-3 gap-2">
                  {['female', 'male', 'non-binary'].map(g => (
                    <label key={g}
                      className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm capitalize transition ${gender === g ? 'border-gold bg-gold/10 text-olive-deep' : 'border-olive/15 bg-cream text-olive/70'}`}>
                      <RadioGroupItem value={g} className="sr-only" />
                      {g === 'non-binary' ? 'Non-binary' : g}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <p className="text-[11px] text-olive/50 leading-relaxed text-center pt-2">
                By continuing you agree to our{' '}
                <button type="button" onClick={onOpenGuidelines} className="underline underline-offset-2 text-olive hover:text-olive-deep">community guidelines</button>.
                {' '}Feel unsafe? <button type="button" onClick={onOpenSafety} className="underline underline-offset-2 text-olive hover:text-olive-deep">Ask for Angela</button>.
              </p>
            </div>
          </motion.div>
        )}

        {currentStepName === 'photo' && (
          <motion.div key="s-photo" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="A live photograph. Real faces only.">A photograph</SectionTitle>
            <div className="flex flex-col items-center">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative h-48 w-48 rounded-full overflow-hidden border-2 border-gold/40 shadow-lg group"
              >
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-olive/5 text-olive/50">
                    <Camera className="h-8 w-8 mb-2" />
                    <div className="text-xs uppercase tracking-[0.15em]">Take / upload</div>
                  </div>
                )}
                <div className="absolute inset-0 ring-1 ring-inset ring-cream/40 rounded-full pointer-events-none" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onPickFile} />

              <div className="mt-6 space-y-2 w-full">
                <Button onClick={() => fileRef.current?.click()} className="w-full h-11 rounded-full bg-olive hover:bg-olive-deep text-cream">
                  <Camera className="h-4 w-4 mr-2" /> {photo ? 'Change photo' : 'Take / upload photo'}
                </Button>
                <button onClick={usePlaceholder}
                  className="w-full text-xs uppercase tracking-[0.15em] text-olive/50 hover:text-olive py-2">
                  Use a demo portrait
                </button>
              </div>

              <div className="mt-5 w-full">
                <Label className="text-xs uppercase tracking-[0.15em] text-olive/60">Short bio (optional)</Label>
                <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="e.g. 'By the window, red wine, reading Le Carré.'"
                  className="mt-2 bg-cream border-olive/20 focus-visible:ring-gold min-h-[70px]" maxLength={120} />
                <div className="text-right text-[11px] text-olive/40 mt-1">{bio.length}/120</div>
              </div>
            </div>
          </motion.div>
        )}

        {currentStepName === 'modes' && (
          <motion.div key="s-modes" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="Choose one or more. You can change later.">Why are you here?</SectionTitle>
            <div className="space-y-3">
              {[
                { key: 'dating', label: 'Dating', desc: 'To meet someone romantically.', icon: Heart },
                { key: 'friends', label: 'Friends', desc: 'To meet another table or a group.', icon: Users },
                { key: 'networking', label: 'Networking', desc: 'To meet others professionally.', icon: Briefcase },
              ].map(({ key, label, desc, icon: Icon }) => {
                const active = modes.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleMode(key)}
                    className={`w-full text-left rounded-2xl border px-4 py-4 flex items-start gap-3 transition ${active ? 'border-gold bg-gold/10' : 'border-olive/15 bg-cream'}`}
                  >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${active ? 'bg-olive text-cream' : 'bg-olive/10 text-olive'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-serif text-lg leading-tight">{label}</div>
                      <div className="text-sm text-olive/70">{desc}</div>
                    </div>
                    <Checkbox checked={active} className="mt-1 pointer-events-none" />
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}

        {currentStepName === 'dating' && (
          <motion.div key="s-dating" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="Used only to match you inside this venue.">Dating preferences</SectionTitle>
            <div className="space-y-6">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-olive/60 mb-2 block">Interested in</Label>
                <RadioGroup value={interestedIn} onValueChange={setInterestedIn} className="grid grid-cols-3 gap-2">
                  {['male', 'female', 'everyone'].map(g => (
                    <label key={g}
                      className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm capitalize transition ${interestedIn === g ? 'border-gold bg-gold/10 text-olive-deep' : 'border-olive/15 bg-cream text-olive/70'}`}>
                      <RadioGroupItem value={g} className="sr-only" />
                      {g === 'male' ? 'Men' : g === 'female' ? 'Women' : 'Everyone'}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs uppercase tracking-[0.15em] text-olive/60">Age range</Label>
                  <span className="font-serif text-lg">{ageRange[0]} – {ageRange[1]}</span>
                </div>
                <Slider min={18} max={70} step={1} value={ageRange} onValueChange={setAgeRange} className="mt-3" />
              </div>
            </div>
          </motion.div>
        )}

        {currentStepName === 'friends' && (
          <motion.div key="s-friends" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="Groups can invite other groups. No chat.">Who are you with?</SectionTitle>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setPartySize(n)}
                    className={`rounded-xl border py-4 flex flex-col items-center transition ${partySize === n ? 'border-gold bg-gold/10' : 'border-olive/15 bg-cream'}`}
                  >
                    <div className="font-serif text-2xl">{n === 4 ? '4+' : n}</div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-olive/60 mt-0.5">
                      {n === 1 ? 'Alone' : n === 4 ? 'Group' : n === 2 ? 'Duo' : 'Trio'}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-olive/60">
                {partySize === 1 ? "You'll browse others who are alone or in groups." : `You'll be able to invite other tables to join yours.`}
              </p>
            </div>
          </motion.div>
        )}

        {currentStepName === 'networking' && (
          <motion.div key="s-net" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="One line. Shown to other networkers here.">What do you do?</SectionTitle>
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] text-olive/60">Your role</Label>
                <Input value={role} onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Product designer at a fintech"
                  className="mt-2 h-12 bg-cream border-olive/20 focus-visible:ring-gold text-base" maxLength={64} />
                <div className="text-right text-[11px] text-olive/40 mt-1">{role.length}/64</div>
              </div>
              <p className="text-center text-xs text-olive/60">
                Networking users can browse each other normally — no photos are blurred, no gender rules apply.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-8 flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} className="text-olive/70 hover:text-olive">
            Back
          </Button>
        )}
        <div className="flex-1" />
        {step < dynamicSteps.length - 1 ? (
          <Button
            disabled={!canNext()}
            onClick={() => setStep(step + 1)}
            className="h-12 px-6 rounded-full bg-olive hover:bg-olive-deep text-cream disabled:opacity-40"
          >
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            disabled={!canNext() || busy}
            onClick={finish}
            className="h-12 px-6 rounded-full bg-olive hover:bg-olive-deep text-cream disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Enter the room <Sparkles className="h-4 w-4 ml-2" /></>}
          </Button>
        )}
      </div>
    </Shell>
  )
}

// ---------- Venue Feed ----------
function VenueFeed({ userId, venue, profile, onLeave, onMatch, onOpenSafety }) {
  const enabledModes = (profile?.modes || ['dating']).filter(m => ['dating','friends','networking'].includes(m))
  const [mode, setMode] = useState(enabledModes[0] || 'dating')
  const [feed, setFeed] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    try {
      const r = await api(`feed?userId=${userId}&venueId=${venue.id}&mode=${mode}`)
      setFeed(r)
    } catch (e) { toast.error(e.message) }
  }

  useEffect(() => { setFeed(null); load() }, [venue?.id, mode])

  const likeCandidate = async (c) => {
    setBusyId(c.id)
    try {
      const wait = new Promise(r => setTimeout(r, mode === 'dating' ? 1400 : 700))
      const call = api('likes', { method: 'POST', body: { fromUserId: userId, toUserId: c.id, venueId: venue.id, mode } })
      const [r] = await Promise.all([call, wait])
      if (r.matched) {
        onMatch({ other: r.other, me: profile, matchId: r.match.id, mode, viaLike: true })
      } else {
        toast(mode === 'friends' ? 'Invite sent.' : mode === 'networking' ? 'Connection request sent.' : 'Interest sent quietly.')
      }
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const acceptIncoming = async (item) => {
    setBusyId(item.likeId)
    try {
      const r = await api('likes/accept', { method: 'POST', body: { likeId: item.likeId, userId } })
      if (r.matched) onMatch({ other: r.other, me: profile, matchId: r.match.id, mode, viaAccept: true })
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const declineIncoming = async (item) => {
    setBusyId(item.likeId)
    try {
      await api('likes/decline', { method: 'POST', body: { likeId: item.likeId, userId } })
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const modeMeta = {
    dating: { icon: Heart, label: 'Dating' },
    friends: { icon: Users, label: 'Friends' },
    networking: { icon: Briefcase, label: 'Networking' },
  }

  return (
    <Shell>
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <OliveWordmark size="sm" />
        <div className="flex items-center gap-1">
          <button onClick={onOpenSafety} className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-olive/60 hover:text-olive px-2 py-1 rounded-full hover:bg-olive/5">
            <Shield className="h-3.5 w-3.5" /> Safety
          </button>
          <button onClick={onLeave} className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-olive/60 hover:text-olive px-2 py-1 rounded-full hover:bg-olive/5">
            <LogOut className="h-3.5 w-3.5" /> Leave
          </button>
        </div>
      </div>

      {/* Venue banner */}
      <div className="rounded-2xl olive-gradient text-cream px-5 py-4 mb-4 shadow-sm">
        <div className="flex items-center gap-2 text-cream/70 text-[11px] uppercase tracking-[0.2em]">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
          <span>Live at</span>
        </div>
        <div className="font-serif text-2xl mt-0.5">{venue?.name}</div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-cream/70 text-xs">{venue?.area}</div>
          <div className="flex items-center gap-1 text-cream/80 text-xs">
            <Users className="h-3.5 w-3.5" /> {feed?.venueLive ?? '…'} here now
          </div>
        </div>
      </div>

      {/* Mode tabs (only if user enabled >1 mode) */}
      {enabledModes.length > 1 && (
        <div className="flex gap-1 mb-4 p-1 rounded-full bg-olive/5 border border-olive/10">
          {enabledModes.map(m => {
            const M = modeMeta[m]
            const active = mode === m
            return (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 h-9 rounded-full flex items-center justify-center gap-1.5 text-xs uppercase tracking-[0.15em] transition ${active ? 'bg-olive text-cream shadow-sm' : 'text-olive/60 hover:text-olive'}`}>
                <M.icon className="h-3.5 w-3.5" /> {M.label}
              </button>
            )
          })}
        </div>
      )}

      {!feed && (
        <div className="flex justify-center py-12 text-olive/60"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}

      {feed?.mode === 'dating' && feed?.role === 'browser' && (
        <BrowserView candidates={feed.candidates} onLike={likeCandidate} busyId={busyId} />
      )}
      {feed?.mode === 'dating' && feed?.role === 'recipient' && (
        <RecipientView items={feed.incoming} onAccept={acceptIncoming} onDecline={declineIncoming} busyId={busyId} />
      )}
      {feed?.mode === 'friends' && (
        <FriendsView feed={feed} onInvite={likeCandidate} onAccept={acceptIncoming} onDecline={declineIncoming} busyId={busyId} profile={profile} />
      )}
      {feed?.mode === 'networking' && (
        <NetworkingView feed={feed} onConnect={likeCandidate} onAccept={acceptIncoming} onDecline={declineIncoming} busyId={busyId} />
      )}
    </Shell>
  )
}

function FriendsView({ feed, onInvite, onAccept, onDecline, busyId, profile }) {
  const myParty = profile?.friendProfile?.partySize || 1
  const partyLabel = (n) => n === 1 ? 'Alone' : `Group of ${n === 4 ? '4+' : n}`
  return (
    <div className="space-y-6">
      {feed.incoming?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark mb-2">Invites for you</div>
          <div className="space-y-2">
            {feed.incoming.map(item => (
              <div key={item.likeId} className="rounded-2xl bg-cream border border-gold/40 p-3 flex items-center gap-3">
                <img src={item.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-lg leading-tight">{item.firstName}, {item.age}</div>
                  <div className="text-xs text-olive/60">{partyLabel(item.partySize)}{item.bio ? ` · ${item.bio}` : ''}</div>
                </div>
                <div className="flex gap-1">
                  <Button disabled={busyId === item.likeId} onClick={() => onAccept(item)} className="h-9 px-3 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]">
                    {busyId === item.likeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Accept'}
                  </Button>
                  <Button variant="ghost" onClick={() => onDecline(item)} className="h-9 px-3 rounded-full text-olive/60 hover:text-olive text-xs">Pass</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-olive/50">
            You are here as: <span className="text-olive">{partyLabel(myParty)}</span>
          </div>
          <div className="text-[11px] text-olive/40">{feed.candidates?.length || 0} to meet</div>
        </div>
        {(!feed.candidates || feed.candidates.length === 0) ? (
          <div className="text-center py-10 text-olive/60">
            <p className="font-serif text-lg text-olive">No other tables looking to meet yet.</p>
            <p className="text-sm mt-1">Try again in a few minutes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {feed.candidates.map(c => (
              <div key={c.id} className="rounded-2xl bg-cream border border-olive/10 overflow-hidden">
                <div className="aspect-[3/4] bg-olive/5 overflow-hidden relative">
                  {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-olive/10" />}
                  <div className="absolute top-2 left-2 rounded-full bg-cream/95 text-olive-deep text-[10px] uppercase tracking-[0.15em] px-2 py-0.5">
                    {partyLabel(c.partySize)}
                  </div>
                </div>
                <div className="px-3 pt-2 pb-3">
                  <div className="font-serif text-lg leading-tight">{c.firstName}, {c.age}</div>
                  {c.bio && <div className="text-[11px] text-olive/60 mt-0.5 line-clamp-2">{c.bio}</div>}
                  <Button
                    disabled={busyId === c.id}
                    onClick={() => onInvite(c)}
                    className="w-full mt-2 h-9 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]"
                  >
                    {busyId === c.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Users className="h-3.5 w-3.5 mr-1.5" /> Invite over</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NetworkingView({ feed, onConnect, onAccept, onDecline, busyId }) {
  return (
    <div className="space-y-6">
      {feed.incoming?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark mb-2">Connection requests</div>
          <div className="space-y-2">
            {feed.incoming.map(item => (
              <div key={item.likeId} className="rounded-2xl bg-cream border border-gold/40 p-3 flex items-center gap-3">
                <img src={item.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-lg leading-tight">{item.firstName}, {item.age}</div>
                  {item.role && <div className="text-xs text-olive/70 italic">{item.role}</div>}
                </div>
                <div className="flex gap-1">
                  <Button disabled={busyId === item.likeId} onClick={() => onAccept(item)} className="h-9 px-3 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]">
                    {busyId === item.likeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Connect'}
                  </Button>
                  <Button variant="ghost" onClick={() => onDecline(item)} className="h-9 px-3 rounded-full text-olive/60 hover:text-olive text-xs">Pass</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-olive/50 mb-2">
          {feed.candidates?.length || 0} networking here
        </div>
        {(!feed.candidates || feed.candidates.length === 0) ? (
          <div className="text-center py-10 text-olive/60">
            <p className="font-serif text-lg text-olive">Nobody networking here yet.</p>
            <p className="text-sm mt-1">Check back shortly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.candidates.map(c => (
              <div key={c.id} className="rounded-2xl bg-cream border border-olive/10 p-3 flex items-center gap-3">
                <img src={c.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-lg leading-tight">{c.firstName}, {c.age}</div>
                  {c.role && <div className="text-sm text-olive/80 italic truncate">{c.role}</div>}
                  {c.bio && <div className="text-[11px] text-olive/60 line-clamp-1">{c.bio}</div>}
                </div>
                <Button
                  disabled={busyId === c.id}
                  onClick={() => onConnect(c)}
                  className="h-9 px-4 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]"
                >
                  {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BrowserView({ candidates, onLike, busyId, profile }) {
  if (!candidates || candidates.length === 0) {
    return (
      <div className="text-center py-14 text-olive/60">
        <p className="font-serif text-xl text-olive">You&apos;ve seen everyone here.</p>
        <p className="text-sm mt-2">Check back as new guests arrive.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-olive/50 mb-3">
        {candidates.length} · here now · compatible
      </div>
      <div className="grid grid-cols-2 gap-3">
        {candidates.map(c => (
          <div key={c.id} className="rounded-2xl bg-cream border border-olive/10 overflow-hidden">
            <div className="aspect-[3/4] bg-olive/5 overflow-hidden">
              {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-olive/10" />}
            </div>
            <div className="px-3 pt-2 pb-3">
              <div className="font-serif text-lg leading-tight">{c.firstName}, {c.age}</div>
              {c.bio && <div className="text-[11px] text-olive/60 mt-0.5 line-clamp-2">{c.bio}</div>}
              <Button
                disabled={busyId === c.id}
                onClick={() => onLike(c)}
                className="w-full mt-2 h-9 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]"
              >
                {busyId === c.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Heart className="h-3.5 w-3.5 mr-1.5" /> Say hello</>}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecipientView({ items, onAccept, onDecline, busyId }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-14 text-olive/60">
        <p className="font-serif text-xl text-olive">The room is quiet — for now.</p>
        <p className="text-sm mt-2">If someone here likes to meet you, we&apos;ll tell you discreetly.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-olive/50">Someone nearby would like to meet you</div>
      {items.map(item => (
        <div key={item.likeId} className="rounded-2xl bg-cream border border-olive/10 overflow-hidden">
          <div className="flex">
            <div className="relative w-32 h-40 shrink-0 bg-olive/10 overflow-hidden">
              {item.blurredPhoto && (
                <img
                  src={item.blurredPhoto}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ filter: 'blur(20px) saturate(0.7)', transform: 'scale(1.1)' }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <EyeOff className="h-6 w-6 text-cream/90 drop-shadow" />
              </div>
            </div>
            <div className="flex-1 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark">Anonymous · here</div>
              <div className="font-serif text-xl mt-0.5">Age {item.age}</div>
              {item.bio && <div className="text-sm text-olive/70 mt-1 line-clamp-2 italic">&ldquo;{item.bio}&rdquo;</div>}
              <div className="flex gap-2 mt-3">
                <Button
                  disabled={busyId === item.likeId}
                  onClick={() => onAccept(item)}
                  className="flex-1 h-9 rounded-full bg-olive hover:bg-olive-deep text-cream text-xs uppercase tracking-[0.15em]"
                >
                  {busyId === item.likeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Reveal</>}
                </Button>
                <Button
                  onClick={() => onDecline(item)}
                  variant="ghost"
                  disabled={busyId === item.likeId}
                  className="h-9 rounded-full text-olive/60 hover:text-olive text-xs uppercase tracking-[0.15em]"
                >
                  Pass
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Safety & Community Guidelines ----------
const COMMUNITY_GUIDELINES = [
  'Be kind. Every profile is a real person in the same room as you.',
  'Real names, real faces, real photographs. No filters that hide who you are.',
  "Consent matters. A 'Not now' is a complete answer. Never ask twice.",
  'Never take or share a photograph of someone else here.',
  'Keep personal details (phone number, address, workplace) private until you have met.',
  "Don't share Olive photos or profiles outside the app.",
  'If someone makes you uncomfortable, use Leave or Ask for Angela. Trust your gut.',
  '18+ only. Anyone under 18 will be removed.',
]

function SafetySheet({ onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(11,15,12,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-cream text-olive-deep rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="olive-gradient text-cream px-6 py-5 flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gold/20 text-gold-light flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cream/60">If you feel unsafe</div>
            <div className="font-serif text-2xl leading-tight mt-0.5">Ask for Angela</div>
          </div>
          <button onClick={onClose} className="text-cream/60 hover:text-cream p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm leading-relaxed">
          <p>
            If you ever feel unsafe, uncomfortable or want to leave a situation quietly,
            go to the bar and say to any member of staff:
          </p>
          <div className="rounded-2xl bg-olive/5 border border-gold/40 px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-olive/60 mb-1">Say</div>
            <div className="font-serif text-xl">&ldquo;Is Angela here?&rdquo;</div>
          </div>
          <p className="text-olive/80">
            Staff are trained to help you leave discreetly — they can call you a taxi,
            walk you to the door, or contact someone on your behalf. Ask for Angela is a
            UK-wide safety scheme run by pubs and bars.
          </p>
          <div className="border-t border-olive/10 pt-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-olive/60 mb-2">You can also, at any time</div>
            <ul className="space-y-1.5 text-olive/80">
              <li className="flex gap-2"><span className="text-gold-dark">·</span> Tap <span className="font-medium">Leave</span> — your profile disappears from the room instantly.</li>
              <li className="flex gap-2"><span className="text-gold-dark">·</span> Reply <span className="font-medium">Not now</span> to any match — nothing is sent, no reason given.</li>
              <li className="flex gap-2"><span className="text-gold-dark">·</span> Meet only at the bar. Never let anyone lead you somewhere quieter.</li>
            </ul>
          </div>
        </div>

        <div className="px-6 pb-6 pt-2">
          <Button onClick={onClose} className="w-full h-11 rounded-full bg-olive hover:bg-olive-deep text-cream">
            Got it
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function GuidelinesSheet({ onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(11,15,12,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-cream text-olive-deep rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="olive-gradient text-cream px-6 py-5 flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cream/60">The house rules</div>
            <div className="font-serif text-2xl leading-tight mt-0.5">Community guidelines</div>
          </div>
          <button onClick={onClose} className="text-cream/60 hover:text-cream p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-2.5 text-sm">
          {COMMUNITY_GUIDELINES.map((g, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="h-5 w-5 rounded-full bg-olive text-cream text-[10px] flex items-center justify-center shrink-0 mt-px font-medium">{i + 1}</span>
              <span className="text-olive/85 leading-relaxed">{g}</span>
            </div>
          ))}
          <p className="text-xs text-olive/60 italic pt-3 border-t border-olive/10">
            By continuing you agree to be part of a room that respects these.
          </p>
        </div>
        <div className="px-6 pb-6 pt-2">
          <Button onClick={onClose} className="w-full h-11 rounded-full bg-olive hover:bg-olive-deep text-cream">
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Small shield icon that sits in a corner and opens the Ask-for-Angela sheet
function SafetyButton({ onOpen, dark = false, label = false }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Safety — Ask for Angela"
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] transition ${dark ? 'text-cream/70 hover:text-cream hover:bg-cream/10' : 'text-olive/60 hover:text-olive hover:bg-olive/5'}`}
    >
      <Shield className="h-3.5 w-3.5" />
      {label && <span>Safety</span>}
    </button>
  )
}

// ---------- Match reveal ----------
// Fixed allowlist mirrors backend. Only public, visible, staffed locations.
// Nothing that suggests going somewhere private (snug, beer garden, upstairs).
const CUE_GROUPS = [
  { label: 'Where', cues: ['By the bar', 'By the front window', 'By the front door', 'Waiting outside the front'] },
  { label: 'Wearing', cues: ['Wearing black', 'Wearing white', 'Wearing red', 'Wearing blue', 'In a green jumper', 'In a denim jacket'] },
  { label: 'Signal', cues: ["I'll wave", 'Just ordering a drink', 'Give me two minutes', 'On my way now'] },
]

function MatchReveal({ userId, payload, venue, onClose, onOpenSafety }) {
  const { other, me, mode = 'dating' } = payload
  const [chosenAction, setChosenAction] = useState(null)
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(null)
  const threadRef = useRef(null)

  const loadMessages = async () => {
    try {
      const r = await api(`messages?matchId=${payload.matchId}&userId=${userId}`)
      setMessages(r.messages || [])
    } catch {}
  }

  useEffect(() => {
    loadMessages()
    const t = setInterval(loadMessages, 2500)
    return () => clearInterval(t)
  }, [payload.matchId])

  useEffect(() => {
    // Auto-scroll thread to bottom on new messages
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages.length])

  const sendCue = async (cue) => {
    setSending(cue)
    try {
      await api('messages', { method: 'POST', body: { matchId: payload.matchId, fromUserId: userId, cue } })
      // Optimistic append
      setMessages(m => [...m, { id: 'tmp', matchId: payload.matchId, fromUserId: userId, toUserId: other?.id, cue, createdAt: Date.now() }])
      await loadMessages()
    } catch (e) { toast.error(e.message) }
    finally { setSending(null) }
  }

  const doAction = async (action) => {
    setChosenAction(action)
    try {
      await api('matches/action', { method: 'POST', body: { matchId: payload.matchId, userId, action } })
    } catch {}
  }

  const modeLabels = {
    dating: 'A quiet match',
    friends: 'You are welcome to join',
    networking: 'A new connection',
  }
  const modeHead = {
    dating: "It's a match.",
    friends: 'You can join them.',
    networking: 'Connected.',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, rgba(19,24,20,0.97) 0%, rgba(11,15,12,0.97) 100%)' }}
    >
      <div className="relative w-full max-w-md pb-8">
        <button onClick={onClose} className="absolute top-0 right-0 text-cream/60 hover:text-cream p-2 z-10">
          <X className="h-5 w-5" />
        </button>

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-center pt-4"
        >
          <div className="text-[11px] uppercase tracking-[0.3em] text-gold-light">{modeLabels[mode]}</div>
          <h2 className="font-serif text-4xl text-cream mt-2">{modeHead[mode]}</h2>
          <div className="h-px w-20 mx-auto mt-3 gold-line" />
        </motion.div>

        <div className="flex items-center justify-center gap-5 mt-6">
          <MatchFace user={me} delay={0.3} />
          <motion.div
            initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.5, type: 'spring' }}
            className="h-11 w-11 rounded-full bg-gold text-olive-deep flex items-center justify-center shadow-lg"
          >
            <Heart className="h-5 w-5 fill-current" />
          </motion.div>
          <MatchFace user={other} delay={0.7} />
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="mt-6 text-center text-cream">
          <div className="font-serif text-2xl">{other?.firstName}, {other?.age}</div>
          {mode === 'networking' && other?.role && <div className="text-gold-light italic text-sm mt-0.5">{other.role}</div>}
          {mode === 'friends' && other?.partySize && (
            <div className="text-gold-light text-sm mt-0.5">
              {other.partySize === 1 ? 'On their own' : `Group of ${other.partySize === 4 ? '4+' : other.partySize}`}
            </div>
          )}
          {other?.bio && <div className="text-cream/60 italic text-sm mt-1">&ldquo;{other.bio}&rdquo;</div>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
          className="mt-6 rounded-2xl bg-cream/5 border border-cream/10 px-5 py-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold-light">Where to meet</div>
          <div className="font-serif text-2xl text-cream mt-0.5">Meet by the bar</div>
          <div className="text-cream/60 text-xs">{venue?.name}</div>
        </motion.div>

        {/* Quick actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
          className="mt-4 grid grid-cols-3 gap-2">
          <Button
            onClick={() => doAction('heading_over')}
            className={`h-10 rounded-full text-[11px] uppercase tracking-[0.15em] ${chosenAction === 'heading_over' ? 'bg-gold text-olive-deep' : 'bg-cream/10 hover:bg-cream/20 text-cream'}`}
          >
            Heading over
          </Button>
          <Button
            onClick={() => doAction('five_minutes')}
            className={`h-10 rounded-full text-[11px] uppercase tracking-[0.15em] ${chosenAction === 'five_minutes' ? 'bg-gold text-olive-deep' : 'bg-cream/10 hover:bg-cream/20 text-cream'}`}
          >
            <Clock className="h-3 w-3 mr-1" /> 5 min
          </Button>
          <Button
            onClick={() => doAction('not_now')}
            className={`h-10 rounded-full text-[11px] uppercase tracking-[0.15em] ${chosenAction === 'not_now' ? 'bg-gold text-olive-deep' : 'bg-cream/10 hover:bg-cream/20 text-cream'}`}
          >
            Not now
          </Button>
        </motion.div>

        {/* Cue thread */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}
          className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold-light text-center mb-3">
            Help each other find the way
          </div>

          {messages.length > 0 && (
            <div ref={threadRef} className="max-h-52 overflow-y-auto no-scrollbar space-y-1.5 mb-3 py-1">
              {messages.map((m, i) => {
                const mine = m.fromUserId === userId
                return (
                  <div key={m.id + '-' + i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-1.5 text-sm ${mine ? 'bg-gold text-olive-deep' : 'bg-cream/15 text-cream'}`}>
                      {m.cue}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-2">
            {CUE_GROUPS.map(g => (
              <div key={g.label}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cream/40 mb-1">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.cues.map(c => (
                    <button
                      key={c}
                      onClick={() => sendCue(c)}
                      disabled={sending === c}
                      className="rounded-full border border-cream/20 bg-cream/5 hover:bg-cream/15 disabled:opacity-40 px-3 py-1.5 text-xs text-cream transition"
                    >
                      {sending === c ? <Loader2 className="h-3 w-3 animate-spin inline" /> : c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-8 text-center">
          <button
            onClick={onOpenSafety}
            className="text-[11px] uppercase tracking-[0.2em] text-cream/60 hover:text-cream inline-flex items-center gap-1.5 mb-4"
          >
            <Shield className="h-3 w-3" /> Feel unsafe? Ask for Angela
          </button>
          <div>
            <Button onClick={onClose} className="h-11 px-6 rounded-full bg-cream text-olive-deep hover:bg-cream-dark">
              Back to the room
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function MatchFace({ user, delay }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay, type: 'spring' }}
      className="relative"
    >
      <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-gold shadow-xl bg-olive/40">
        {user?.photo
          ? <img src={user.photo} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-olive/40" />}
      </div>
    </motion.div>
  )
}

export default App
