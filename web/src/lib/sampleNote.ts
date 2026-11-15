// A clearly FAKE discharge note for demos (README §7: never real medical data).
export async function sampleNote(): Promise<File> {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 1200
  const g = c.getContext('2d')!
  g.fillStyle = '#fdfcf8'
  g.fillRect(0, 0, 900, 1200)
  g.fillStyle = '#1d3b6a'
  g.fillRect(0, 0, 900, 110)
  g.fillStyle = '#fff'
  g.font = 'bold 40px Georgia'
  g.fillText('Maple Grove Clinic', 50, 70)
  g.font = '20px Arial'
  g.fillText('DEMO ONLY · NOT A REAL PRESCRIPTION', 520, 70)
  g.fillStyle = '#222'
  g.font = 'bold 30px Arial'
  g.fillText('Discharge Instructions', 50, 175)
  g.font = '22px Arial'
  const lines = [
    'Patient: Asha (demo)          Physician: Dr. Patel (fictional)',
    '',
    'MEDICATIONS',
    '• Metformin 500 mg by mouth twice daily with meals.',
    '',
    'FOLLOW-UP',
    '• Follow up in clinic with Dr. Patel on Thursday 10:00 AM.',
    '',
    'INSTRUCTIONS',
    '• Check BP daily; call if above 160/100.',
    '• Drink plenty of water. Short walks are encouraged.',
  ]
  lines.forEach((l, i) => {
    g.font = /^[A-Z ]+$/.test(l) && l ? 'bold 22px Arial' : '22px "Comic Sans MS", Arial'
    g.fillText(l, 50, 240 + i * 42)
  })
  g.strokeStyle = '#1d3b6a'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(560, 1050)
  g.bezierCurveTo(600, 1000, 640, 1090, 700, 1030)
  g.bezierCurveTo(740, 990, 760, 1060, 820, 1040)
  g.stroke()
  g.font = '18px Arial'
  g.fillText('Dr. Patel (fictional)', 600, 1090)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
  return new File([blob], 'discharge-note-DEMO.png', { type: 'image/png' })
}
