'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  MapPin, Check, ChevronRight, Camera, X, Heart, HandshakeIcon, Briefcase,
  LogOut, Sparkles, Users, EyeOff, Clock, ArrowRight, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'

// ---------- Small primitives ----------
// The sprig sits at the top-right of the "O" — matches the tent-card wordmark.
const OliveSprig = ({ size = 22, className = '' }) => (
  <svg width={size * 0.9} height={size} viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* stem */}
    <path d="M8 40 C 12 28, 20 18, 34 6" stroke="#7A8C5C" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    {/* leaves — right side */}
    <path d="M22 18 C 27 14, 33 14, 36 12 C 33 18, 28 22, 23 22 Z" fill="#8B9668"/>
    <path d="M15 28 C 20 24, 26 24, 29 22 C 26 28, 21 32, 16 32 Z" fill="#7A8C5C"/>
    {/* leaves — left side */}
    <path d="M18 22 C 13 20, 8 22, 6 24 C 10 26, 15 26, 18 24 Z" fill="#98A57A"/>
    {/* olive berry */}
    <circle cx="30" cy="14" r="2.2" fill="#556B2F"/>
    <circle cx="30" cy="14" r="0.8" fill="#7A8C5C" opacity="0.6"/>
  </svg>
)

// Full wordmark: sprig overlapping the "O" of "Olive"
const OliveWordmark = ({ size = 'md', dark = false }) => {
  const sizes = {
    sm: { text: 'text-xl', sprig: 14, offsetY: '-top-1.5', offsetX: '-left-1' },
    md: { text: 'text-2xl', sprig: 18, offsetY: '-top-2', offsetX: '-left-1.5' },
    lg: { text: 'text-4xl', sprig: 28, offsetY: '-top-3', offsetX: '-left-2' },
  }
  const s = sizes[size] || sizes.md
  return (
    <span className={`relative inline-flex items-baseline font-serif ${s.text} tracking-wide leading-none ${dark ? 'text-cream' : 'text-olive-deep'}`}>
      <span className="relative inline-block">
        <span className="relative z-10">O</span>
        <span className={`absolute ${s.offsetY} ${s.offsetX} z-20 pointer-events-none`}>
          <OliveSprig size={s.sprig} />
        </span>
      </span>
      <span>live</span>
    </span>
  )
}

const Shell = ({ children, dark }) => (
  <div className={`min-h-screen w-full ${dark ? 'olive-gradient text-cream' : 'paper text-olive-deep'}`}>
    <div className="mx-auto w-full max-w-md px-5 pt-6 pb-10 safe-top safe-bottom">
      {children}
    </div>
  </div>
)

const BrandHeader = ({ dark }) => (
  <div className="flex items-center justify-center pb-6">
    <OliveWordmark size="md" dark={dark} />
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
function CheckIn({ venues, located, locationStatus, showPicker, setShowPicker, onConfirm }) {
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
    </Shell>
  )
}

// ---------- Onboarding ----------
function Onboarding({ venue, existing, onDone }) {
  const [step, setStep] = useState(0)
  const steps = ['name', 'photo', 'modes', 'dating']
  const [firstName, setFirstName] = useState(existing?.firstName || '')
  const [age, setAge] = useState(existing?.age || 28)
  const [gender, setGender] = useState(existing?.gender || 'female')
  const [photo, setPhoto] = useState(existing?.photo || null)
  const [bio, setBio] = useState(existing?.bio || '')
  const [modes, setModes] = useState(existing?.modes || ['dating'])
  const [interestedIn, setInterestedIn] = useState(existing?.datingPrefs?.interestedIn || 'male')
  const [ageRange, setAgeRange] = useState([existing?.datingPrefs?.ageMin || 25, existing?.datingPrefs?.ageMax || 40])
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
    // Fast path: assign a portrait so onboarding stays under 60 seconds.
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
      }
      await onDone(payload)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const canNext = () => {
    if (step === 0) return firstName.trim().length >= 1 && age >= 18 && age <= 99 && gender
    if (step === 1) return !!photo
    if (step === 2) return modes.length > 0
    if (step === 3) return true
    return false
  }

  const showDatingStep = modes.includes('dating')
  const visibleSteps = showDatingStep ? steps : steps.slice(0, 3)
  const progress = Math.round(((step + 1) / visibleSteps.length) * 100)

  return (
    <Shell>
      <BrandHeader />
      <div className="mb-4">
        <div className="text-center text-[11px] uppercase tracking-[0.2em] text-olive/50 mb-2">
          At {venue?.name} · Step {step + 1} of {visibleSteps.length}
        </div>
        <div className="h-[2px] bg-olive/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-gold" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
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
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
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

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <SectionTitle sub="Choose one or more. You can change later.">Why are you here?</SectionTitle>
            <div className="space-y-3">
              {[
                { key: 'dating', label: 'Dating', desc: 'To meet someone romantically.', icon: Heart, avail: true },
                { key: 'friends', label: 'Friends', desc: 'To meet another table or a group.', icon: Users, avail: false },
                { key: 'networking', label: 'Networking', desc: 'To meet others professionally.', icon: Briefcase, avail: false },
              ].map(({ key, label, desc, icon: Icon, avail }) => {
                const active = modes.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => avail && toggleMode(key)}
                    disabled={!avail}
                    className={`w-full text-left rounded-2xl border px-4 py-4 flex items-start gap-3 transition ${active ? 'border-gold bg-gold/10' : 'border-olive/15 bg-cream'} ${!avail ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${active ? 'bg-olive text-cream' : 'bg-olive/10 text-olive'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-serif text-lg leading-tight flex items-center gap-2">
                        {label}
                        {!avail && <span className="text-[10px] uppercase tracking-[0.15em] text-olive/50">Soon</span>}
                      </div>
                      <div className="text-sm text-olive/70">{desc}</div>
                    </div>
                    <Checkbox checked={active} className="mt-1 pointer-events-none" />
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}

        {step === 3 && showDatingStep && (
          <motion.div key="s3" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
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
      </AnimatePresence>

      <div className="pt-8 flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} className="text-olive/70 hover:text-olive">
            Back
          </Button>
        )}
        <div className="flex-1" />
        {step < visibleSteps.length - 1 ? (
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
function VenueFeed({ userId, venue, profile, onLeave, onMatch }) {
  const [feed, setFeed] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const isMale = profile?.gender === 'male'

  const load = async () => {
    try {
      const r = await api(`feed?userId=${userId}&venueId=${venue.id}`)
      setFeed(r)
    } catch (e) { toast.error(e.message) }
  }

  useEffect(() => { load() }, [venue?.id])

  const likeCandidate = async (c) => {
    setBusyId(c.id)
    try {
      // Suspenseful pause so it feels considered
      const wait = new Promise(r => setTimeout(r, 1400))
      const call = api('likes', { method: 'POST', body: { fromUserId: userId, toUserId: c.id, venueId: venue.id } })
      const [r] = await Promise.all([call, wait])
      if (r.matched) {
        onMatch({ other: r.other, me: profile, matchId: r.match.id, viaLike: true })
      } else {
        toast('Interest sent quietly.')
      }
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const acceptIncoming = async (item) => {
    setBusyId(item.likeId)
    try {
      const r = await api('likes/accept', { method: 'POST', body: { likeId: item.likeId, userId } })
      if (r.matched) onMatch({ other: r.other, me: profile, matchId: r.match.id, viaAccept: true })
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

  return (
    <Shell>
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <OliveWordmark size="sm" />
        <button onClick={onLeave} className="flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-olive/60 hover:text-olive">
          <LogOut className="h-3.5 w-3.5" /> Leave
        </button>
      </div>

      {/* Venue banner */}
      <div className="rounded-2xl olive-gradient text-cream px-5 py-4 mb-6 shadow-sm">
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

      {!feed && (
        <div className="flex justify-center py-12 text-olive/60"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}

      {feed?.role === 'browser' && (
        <BrowserView candidates={feed.candidates} onLike={likeCandidate} busyId={busyId} profile={profile} />
      )}

      {feed?.role === 'recipient' && (
        <RecipientView items={feed.incoming} onAccept={acceptIncoming} onDecline={declineIncoming} busyId={busyId} />
      )}
    </Shell>
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

// ---------- Match reveal ----------
function MatchReveal({ userId, payload, venue, onClose }) {
  const { other, me } = payload
  const [phase, setPhase] = useState('reveal') // reveal | actioned
  const [chosen, setChosen] = useState(null)

  const doAction = async (action) => {
    setChosen(action)
    setPhase('actioned')
    try {
      await api('matches/action', { method: 'POST', body: { matchId: payload.matchId, userId, action } })
    } catch {}
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ background: 'linear-gradient(160deg, rgba(19,24,20,0.97) 0%, rgba(11,15,12,0.97) 100%)' }}
    >
      <div className="relative w-full max-w-md">
        <button onClick={onClose} className="absolute top-0 right-0 text-cream/60 hover:text-cream p-2">
          <X className="h-5 w-5" />
        </button>

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-center pt-6"
        >
          <div className="text-[11px] uppercase tracking-[0.3em] text-gold-light">A quiet match</div>
          <h2 className="font-serif text-5xl text-cream mt-2">It&apos;s a match.</h2>
          <div className="h-px w-24 mx-auto mt-4 gold-line" />
        </motion.div>

        <div className="flex items-center justify-center gap-6 mt-8">
          <MatchFace user={me} delay={0.3} />
          <motion.div
            initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.5, type: 'spring' }}
            className="h-12 w-12 rounded-full bg-gold text-olive-deep flex items-center justify-center shadow-lg"
          >
            <Heart className="h-6 w-6 fill-current" />
          </motion.div>
          <MatchFace user={other} delay={0.7} />
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="mt-8 text-center text-cream">
          <div className="font-serif text-2xl">{other?.firstName}, {other?.age}</div>
          {other?.bio && <div className="text-cream/70 italic text-sm mt-1">&ldquo;{other.bio}&rdquo;</div>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
          className="mt-8 rounded-2xl bg-cream/5 border border-cream/10 px-5 py-4 text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-gold-light">Where to meet</div>
          <div className="font-serif text-3xl text-cream mt-1">Meet by the bar</div>
          <div className="text-cream/60 text-xs mt-1">{venue?.name}</div>
        </motion.div>

        {phase === 'reveal' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}
            className="mt-6 grid grid-cols-3 gap-2">
            <Button onClick={() => doAction('heading_over')} className="h-11 rounded-full bg-gold hover:bg-gold-dark text-olive-deep text-xs uppercase tracking-[0.15em]">
              Heading over
            </Button>
            <Button onClick={() => doAction('five_minutes')} variant="outline" className="h-11 rounded-full border-cream/30 bg-transparent text-cream hover:bg-cream/10 hover:text-cream text-xs uppercase tracking-[0.15em]">
              <Clock className="h-3.5 w-3.5 mr-1" /> 5 min
            </Button>
            <Button onClick={() => doAction('not_now')} variant="ghost" className="h-11 rounded-full text-cream/70 hover:text-cream hover:bg-cream/5 text-xs uppercase tracking-[0.15em]">
              Not now
            </Button>
          </motion.div>
        )}

        {phase === 'actioned' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-6 text-center text-cream">
            <div className="font-serif text-xl">
              {chosen === 'heading_over' && `${other?.firstName} has been told you\u2019re on your way.`}
              {chosen === 'five_minutes' && `${other?.firstName} knows you'll be there in five.`}
              {chosen === 'not_now' && `Kept private. No message sent.`}
            </div>
            <Button onClick={onClose} className="mt-6 h-11 px-6 rounded-full bg-cream text-olive-deep hover:bg-cream-dark">
              Back to the room
            </Button>
          </motion.div>
        )}
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
