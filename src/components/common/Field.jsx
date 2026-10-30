import React from 'react'

function Field({ name, label, type, placeholder, options, value, error, onChange, required = true }) {
  const errorId = error ? `erro-${name}` : undefined

  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={name}>
        {label}
        {required && <span aria-hidden="true">*</span>}
      </label>
      {options ? (
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          aria-required={required}
        >
          <option value="">{placeholder || 'selecione uma opção'}</option>
          {options.map((option) => {
            const item = typeof option === 'object' ? option : { value: option, label: option }
            return <option key={item.value} value={item.value}>{item.label}</option>
          })}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          aria-required={required}
        />
      )}
      {error && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

export default Field
