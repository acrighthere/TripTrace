// Map overlay + toast strings. Keys are prefixed "map.".
// Shared words (saved/deleted/retry/tryAgain) live in common.ts — reuse those.
//
// Count-bearing keys use a "noun: {count}" style in Russian to sidestep
// Slavic plural agreement, while English keeps natural plurals.
export const map = {
  ru: {
    "map.loading": "Загружаем вашу карту…",
    "map.loadError": "Не удалось загрузить ваши места.",
    "map.empty": "Пока нет отмеченных мест — нажмите на карту, чтобы добавить первый город",
    "map.showAreas": "Показать посещённые страны",
    "map.hideAreas": "Скрыть посещённые страны",
    "map.alreadyPinned": "Уже отмечено",
    "map.placesAttached": "Сохранено — прикреплено мест: {count}",
    "map.couldntDelete": "Не удалось удалить. Попробуйте ещё раз.",
    "map.markedVisited": "Отмечено как посещённое",
    "map.movedToWishlist": "В списке желаний",
    "map.addedToTrip": "Добавлено в поездку",
    "map.removedFromTrip": "Убрано из поездки",
    "map.tripCreated": "Поездка создана",
    "map.couldntCreateTrip": "Не удалось создать поездку.",
    "map.couldntRenameTrip": "Не удалось переименовать поездку.",
    "map.tripDeleted": "Поездка удалена",
    "map.couldntDeleteTrip": "Не удалось удалить поездку.",
  },
  en: {
    "map.loading": "Loading your map…",
    "map.loadError": "Couldn't load your visits.",
    "map.empty": "No places pinned yet — click the map to add your first city",
    "map.showAreas": "Show visited countries",
    "map.hideAreas": "Hide visited countries",
    "map.alreadyPinned": "Already pinned",
    "map.placesAttached": "Saved — {count} places attached",
    "map.couldntDelete": "Couldn't delete. Try again.",
    "map.markedVisited": "Marked visited",
    "map.movedToWishlist": "Moved to wishlist",
    "map.addedToTrip": "Added to trip",
    "map.removedFromTrip": "Removed from trip",
    "map.tripCreated": "Trip created",
    "map.couldntCreateTrip": "Couldn't create trip.",
    "map.couldntRenameTrip": "Couldn't rename trip.",
    "map.tripDeleted": "Trip deleted",
    "map.couldntDeleteTrip": "Couldn't delete trip.",
  },
};
