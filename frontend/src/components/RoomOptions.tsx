import { useTranslation } from 'react-i18next'
import type { Room } from '../api'
import { groupByFloor } from '../api'

// Options for a room <select>, grouped per floor. The floor itself is
// selectable as the first entry of its group ("entire floor"); rooms without
// a floor are plain options at the end.
export function RoomOptions({ rooms }: { rooms: Room[] }) {
  const { t } = useTranslation()
  return (
    <>
      {groupByFloor(rooms).map((group) =>
        group.floor ? (
          <optgroup key={`floor-${group.floor.id}`} label={group.floor.name}>
            <option value={group.floor.id}>
              {group.floor.name} — {t('common.entireFloor')}
            </option>
            {group.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </optgroup>
        ) : (
          group.rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))
        ),
      )}
    </>
  )
}
