// A photo of Giles's across the top of the page, served from the Slinkycues hub (/photos).
const SIZES = [640, 1280, 1600]
const NAME = 'friends-rocks'

export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <img
        src={`/photos/${NAME}-${SIZES.find((s) => s >= 1280) ?? SIZES[SIZES.length - 1]}.webp`}
        srcSet={SIZES.map((w) => `/photos/${NAME}-${w}.webp ${w}w`).join(', ')}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        style={{ objectPosition: 'center 45%' }}
      />
    </div>
  )
}
