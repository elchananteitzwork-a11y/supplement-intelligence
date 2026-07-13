import { describe, it, expect } from 'vitest'
import { PROBLEM_TOPICS } from '../topics'

describe('PROBLEM_TOPICS taxonomy', () => {
  it('every topic has a unique key and at least one real keyword pattern', () => {
    const keys = PROBLEM_TOPICS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const topic of PROBLEM_TOPICS) {
      expect(topic.keywords.length).toBeGreaterThan(0)
      expect(topic.label.length).toBeGreaterThan(0)
    }
  })

  it('matches realistic real-world phrasing for each of the known VOC clusters', () => {
    const samples: Record<string, string> = {
      perimenopause_hormonal:  'Is anyone else dealing with brain fog during perimenopause?',
      blood_sugar_energy:      'Massive afternoon crash every day, my blood sugar is all over the place',
      cortisol_sleep:          'Melatonin doesn\'t work for me anymore, I think my cortisol is the real problem',
      gut_skin_inflammation:   'My rosacea flares up whenever my gut health is bad, so bloated too',
      stubborn_weight_gain:    'I eat healthy and exercise but I still can\'t lose weight, so frustrating',
      pet_inflammation:        'My dog won\'t stop scratching, vet thinks it might be allergies',
      fitness_plateau_recovery: 'Hit a plateau with my creatine cycle, recovery gap is real',
      stress_hair_loss:        'Stress-related hair loss and shedding, tried biotin with no luck',
    }

    for (const topic of PROBLEM_TOPICS) {
      const sample = samples[topic.key]
      expect(sample, `no sample text defined for topic ${topic.key}`).toBeDefined()
      const matches = topic.keywords.some(rx => rx.test(sample))
      expect(matches, `topic ${topic.key} did not match its own realistic sample: "${sample}"`).toBe(true)
    }
  })

  it('does not match unrelated, generic text', () => {
    const unrelated = 'Just wanted to share a photo of my breakfast today, feeling great!'
    for (const topic of PROBLEM_TOPICS) {
      expect(topic.keywords.some(rx => rx.test(unrelated))).toBe(false)
    }
  })
})
