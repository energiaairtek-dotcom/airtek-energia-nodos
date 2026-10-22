import { useContext } from 'react';
import { PlantCardContext } from '@/modules/nodes/context/plantCardContext';

export function usePlantCard() {
  const ctx = useContext(PlantCardContext);
  if (!ctx) {
    throw new Error('PlantCard subcomponents must be used within PlantCard.Root');
  }
  return ctx;
}

export default usePlantCard;
