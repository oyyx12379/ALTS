import { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import workerSrc from '../../node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ASSET_BASE_URL } from '../config'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const PDF_FILES = [
  { name: '行于泰拉 v1.2', file: '/pdf/行于泰拉v1.2.pdf' },
  { name: '世界观', file: '/pdf/世界观.pdf' },
]

export default function PdfReader() {
  const [selectedPdf, setSelectedPdf] = useState(PDF_FILES[0])
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [error, setError] = useState('')

  const pdfUrl = ASSET_BASE_URL + selectedPdf.file

  // Reset error when switching PDFs
  useEffect(() => {
    setError('')
    setNumPages(0)
    setPageNumber(1)
  }, [selectedPdf.file])

  const onLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
    setError('')
  }

  const onLoadError = (err: any) => {
    console.error('PDF load error:', err)
    setError(`加载失败: ${err?.message || '未知错误'}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {PDF_FILES.map(pdf => (
            <button
              key={pdf.name}
              className={`btn btn-sm ${selectedPdf.name === pdf.name ? 'btn-primary' : ''}`}
              onClick={() => setSelectedPdf(pdf)}
            >
              {pdf.name}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>◀</button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{pageNumber} / {numPages || '?'}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>▶</button>
          <input className="input" type="number" value={pageNumber}
            onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= numPages) setPageNumber(v) }}
            style={{ width: 60, textAlign: 'center', padding: '4px 6px', fontSize: 12 }} min={1} max={numPages} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>🔍-</button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setScale(s => Math.min(3, s + 0.2))}>🔍+</button>
        </div>
      </div>

      {/* PDF Content */}
      <div style={{ flex: 1, overflow: 'auto', background: '#525659', display: 'flex', justifyContent: 'center', padding: 16 }}>
        {error ? (
          <div style={{ padding: 40, color: '#ff4d4f', textAlign: 'center' }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>PDF加载失败</p>
            <p style={{ fontSize: 12, color: '#999' }}>{error}</p>
          </div>
        ) : (
          <Document
            key={pdfUrl}
            file={pdfUrl}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={
              <div style={{ padding: 40, color: '#fff', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <span>加载PDF中...</span>
              </div>
            }
          >
            <Page pageNumber={pageNumber} scale={scale}
              renderTextLayer={true} renderAnnotationLayer={true} />
          </Document>
        )}
      </div>
    </div>
  )
}
