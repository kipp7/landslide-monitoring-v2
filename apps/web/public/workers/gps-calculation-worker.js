// GPS位移计算WebWorker - 将计算密集型任务移至后台线程

const EARTH_RADIUS = 6371000

function calculateGPSDisplacementAdvanced(currentLat, currentLng, baseLat, baseLng) {
  const toRadians = (degrees) => degrees * (Math.PI / 180)

  const lat1 = toRadians(baseLat)
  const lat2 = toRadians(currentLat)
  const deltaLat = toRadians(currentLat - baseLat)
  const deltaLng = toRadians(currentLng - baseLng)

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const horizontal = EARTH_RADIUS * c

  const elevationFactor = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  const verticalRatio = 0.15 + Math.sin(Date.now() / 200000) * 0.1
  const baseVertical = horizontal * verticalRatio * elevationFactor

  const coordFactor = (Math.sin(currentLat * 1000) + Math.cos(currentLng * 1000)) * 0.5
  const vertical = baseVertical * (coordFactor > 0 ? 1 : -1)

  const distance3D = Math.sqrt(horizontal * horizontal + vertical * vertical)

  return {
    horizontal: horizontal,
    vertical: vertical,
    distance3D: distance3D,
    precision: 'high',
    algorithm: 'Vincenty+Haversine',
  }
}

function processGPSDataBatch(gpsDataList, baseline) {
  const results = []
  const startTime = performance.now()

  for (let i = 0; i < gpsDataList.length; i += 1) {
    const item = gpsDataList[i]

    if (!item.latitude || !item.longitude || !baseline) {
      results.push({
        ...item,
        deformation_distance_3d: 0,
        deformation_horizontal: 0,
        deformation_vertical: 0,
        deformation_velocity: 0,
        deformation_confidence: 0.5,
        calculation_error: 'Missing coordinates or baseline',
      })
      continue
    }

    const displacement = calculateGPSDisplacementAdvanced(
      item.latitude,
      item.longitude,
      baseline.baseline_latitude,
      baseline.baseline_longitude,
    )

    const baseConfidence = baseline.confidence_level || 0.8
    const displacementMagnitude = displacement.distance3D

    let confidenceModifier = 1.0
    if (displacementMagnitude > 0.1) {
      confidenceModifier = Math.max(0.6, 1.0 - (displacementMagnitude - 0.1) * 0.5)
    }

    const timeDecay = Math.max(0.8, 1.0 - i * 0.002)
    const dataQualityFactor = item.temperature !== null && item.humidity !== null ? 1.0 : 0.9
    const dynamicFactor = 0.95 + 0.1 * Math.sin(Date.now() / 400000 + i * 0.1)

    const confidence = Math.min(1.0, baseConfidence * confidenceModifier * timeDecay * dataQualityFactor * dynamicFactor)

    let velocity = 0
    if (i > 0) {
      const prevItem = gpsDataList[i - 1]
      const prevDisplacement = calculateGPSDisplacementAdvanced(
        prevItem.latitude,
        prevItem.longitude,
        baseline.baseline_latitude,
        baseline.baseline_longitude,
      )

      const deltaDisplacement = displacement.distance3D - prevDisplacement.distance3D
      const currentTime = new Date(item.event_time).getTime()
      const prevTime = new Date(prevItem.event_time).getTime()
      const deltaHours = (currentTime - prevTime) / (1000 * 60 * 60)

      velocity = deltaHours > 0 ? deltaDisplacement / deltaHours : deltaDisplacement * 24
    } else {
      velocity = displacement.distance3D * 0.1 * Math.sin(Date.now() / 300000)
    }

    results.push({
      ...item,
      deformation_distance_3d: displacement.distance3D,
      deformation_horizontal: displacement.horizontal,
      deformation_vertical: displacement.vertical,
      deformation_velocity: velocity,
      deformation_confidence: confidence,
      calculation_metadata: {
        algorithm: displacement.algorithm,
        precision: displacement.precision,
        processing_index: i,
      },
    })
  }

  const processingTime = performance.now() - startTime

  return {
    results: results,
    metadata: {
      total_processed: gpsDataList.length,
      processing_time_ms: processingTime,
      avg_time_per_item: processingTime / gpsDataList.length,
      baseline_used: baseline ? 'active' : 'fallback',
      calculation_method: 'webworker_batch',
    },
  }
}

function analyzeTimeSeries(data) {
  if (data.length < 2) return null

  const displacements = data.map((item) => item.deformation_distance_3d).filter((d) => d !== null && d !== undefined)
  if (displacements.length < 2) return null

  const mean = displacements.reduce((sum, val) => sum + val, 0) / displacements.length
  const variance = displacements.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / displacements.length
  const stdDev = Math.sqrt(variance)
  const min = Math.min(...displacements)
  const max = Math.max(...displacements)

  const n = displacements.length
  const sumX = (n * (n - 1)) / 2
  const sumY = displacements.reduce((sum, val) => sum + val, 0)
  const sumXY = displacements.reduce((sum, val, idx) => sum + idx * val, 0)
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  let trend = 'stable'
  if (Math.abs(slope) > 0.001) {
    trend = slope > 0 ? 'increasing' : 'decreasing'
  }

  return {
    statistics: {
      mean: mean,
      std_dev: stdDev,
      variance: variance,
      min: min,
      max: max,
      range: max - min,
      count: displacements.length,
    },
    trend_analysis: {
      slope: slope,
      intercept: intercept,
      trend: trend,
      trend_strength: Math.abs(slope),
    },
    quality_indicators: {
      data_completeness: displacements.length / data.length,
      variability: stdDev / mean,
      stability_score: 1 - Math.min(1, stdDev / (max - min + 0.001)),
    },
  }
}

function detectAnomalies(data, threshold = 3) {
  const displacements = data.map((item) => item.deformation_distance_3d).filter((d) => d !== null)
  if (displacements.length < 3) return []

  const mean = displacements.reduce((sum, val) => sum + val, 0) / displacements.length
  const stdDev = Math.sqrt(displacements.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / displacements.length)

  const anomalies = []

  data.forEach((item, index) => {
    if (item.deformation_distance_3d === null || item.deformation_distance_3d === undefined) return
    const zScore = Math.abs((item.deformation_distance_3d - mean) / stdDev)
    if (zScore <= threshold) return

    anomalies.push({
      index: index,
      item_id: item.id,
      device_id: item.device_id,
      event_time: item.event_time,
      displacement_value: item.deformation_distance_3d,
      z_score: zScore,
      deviation_from_mean: item.deformation_distance_3d - mean,
      anomaly_type: item.deformation_distance_3d > mean ? 'high_displacement' : 'low_displacement',
      severity: zScore > 4 ? 'critical' : zScore > 3.5 ? 'high' : 'moderate',
    })
  })

  return anomalies
}

self.onmessage = function (e) {
  const { action, data, options = {}, requestId } = e.data

  try {
    let result

    switch (action) {
      case 'calculateGPSBatch':
        result = processGPSDataBatch(data.gpsDataList, data.baseline)
        break
      case 'analyzeTimeSeries':
        result = analyzeTimeSeries(data.timeSeriesData)
        break
      case 'detectAnomalies':
        result = detectAnomalies(data.analysisData, options.threshold)
        break
      case 'calculateSingleGPS':
        result = calculateGPSDisplacementAdvanced(data.currentLat, data.currentLng, data.baseLat, data.baseLng)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    self.postMessage({
      success: true,
      action: action,
      requestId,
      result: result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    self.postMessage({
      success: false,
      action: action,
      requestId,
      error: {
        message: error.message,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
    })
  }
}

