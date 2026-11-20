import { useState } from 'react'

interface ProfileAvatarProps {
  url: string | null | undefined
  name: string | null | undefined
  className: string
  imageAlt?: string
  ariaHidden?: boolean
}

/** A profile image with a consistent initials fallback, including broken/expired URLs. */
export default function ProfileAvatar({ url, name, className, imageAlt = '', ariaHidden }: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initial = name?.trim().charAt(0).toLocaleUpperCase() || 'A'
  const showImage = Boolean(url && failedUrl !== url)

  return (
    <span className={className} aria-hidden={ariaHidden}>
      {showImage
        ? <img src={url!} alt={imageAlt} onError={() => setFailedUrl(url!)} />
        : initial}
    </span>
  )
}
